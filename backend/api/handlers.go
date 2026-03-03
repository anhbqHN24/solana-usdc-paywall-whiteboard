package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"solana_paywall/backend/database"
	"solana_paywall/backend/enum"
	"solana_paywall/backend/watcher"
	"strconv"
	"time"

	"github.com/gagliardetto/solana-go"
	"github.com/google/uuid"
)

type ContentResponse struct {
	HasAccess bool `json:"hasAccess"`
}

type InvoiceRequest struct {
	WalletAddress string `json:"walletAddress"`
}

type InvoiceResponse struct {
	Reference string `json:"reference"`
}

func CreateInvoice(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST method is allowed", http.StatusMethodNotAllowed)
		return
	}

	var req InvoiceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if !isValidWalletAddress(req.WalletAddress) {
		http.Error(w, "walletAddress is invalid", http.StatusBadRequest)
		return
	}

	reference := uuid.New().String()
	amount := 10_000_000 // 10 USDC (6 decimal places)
	// --- NEW: IN-MEMORY FIRST STRATEGY ---
	// Instead of writing to PostgreSQL, write to Redis with a TTL
	redisKey := fmt.Sprintf("invoice:%s", reference)
	invoiceData := map[string]interface{}{
		"wallet_address": req.WalletAddress,
		"amount":         amount,
	}

	// Use HSet to store the invoice data as a hash
	if err := database.RDB.HSet(database.Ctx, redisKey, invoiceData).Err(); err != nil {
		http.Error(w, "Failed to create invoice", http.StatusInternalServerError)
		return
	}

	// Set a 10-minute expiration for the invoice
	if err := database.RDB.Expire(database.Ctx, redisKey, 10*time.Minute).Err(); err != nil {
		// Log the error, but don't fail the request. The invoice will just persist.
		// In a production scenario, you might want a cleanup job for keys without TTL.
		http.Error(w, "Failed to set invoice expiration", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(InvoiceResponse{Reference: reference})
}

type ConfirmInvoiceRequest struct {
	Reference string `json:"reference"`
	Signature string `json:"signature"`
}

func ConfirmInvoice(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST method is allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ConfirmInvoiceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if !isValidReference(req.Reference) || req.Signature == "" {
		http.Error(w, "reference or signature is invalid", http.StatusBadRequest)
		return
	}

	// --- NEW: IN-MEMORY FIRST STRATEGY ---
	// 1. Get invoice data from Redis
	redisKey := fmt.Sprintf("invoice:%s", req.Reference)
	invoiceData, err := database.RDB.HGetAll(database.Ctx, redisKey).Result()
	if err != nil {
		http.Error(w, "Failed to retrieve invoice data", http.StatusInternalServerError)
		return
	}
	if len(invoiceData) == 0 {
		http.Error(w, "Invoice not found or expired", http.StatusNotFound)
		return
	}

	walletAddress := invoiceData["wallet_address"]

	amountStr := invoiceData["amount"]
	amount, err := strconv.ParseInt(amountStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid amount in invoice data", http.StatusInternalServerError)
		return
	}

	// 2. Verify transaction on-chain synchronously
	err = watcher.VerifyTransaction(req.Reference, req.Signature, amount)
	if err != nil {
		// Return the specific verification error to the frontend
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// 3. If verification is successful, save to PostgreSQL
	_, err = database.DB.Exec(`
		INSERT INTO invoice (wallet_address, reference, amount, signature, status) 
		VALUES ($1, $2, $3, $4, $5)`,
		walletAddress, req.Reference, amount, req.Signature, enum.INVOICE_PAID,
	)
	if err != nil {
		// This could happen in a race condition if the sweeper processed it first.
		// We can consider this case as "OK" since the final state is correct.
		// For now, we'll return an error to be safe.
		http.Error(w, "Failed to save confirmed invoice", http.StatusInternalServerError)
		return
	}

	// 4. Delete from Redis
	database.RDB.Del(database.Ctx, redisKey)

	w.WriteHeader(http.StatusOK)
}

func GetContent(w http.ResponseWriter, r *http.Request) {
	walletAddress := r.URL.Query().Get("walletAddress")
	if !isValidWalletAddress(walletAddress) {
		http.Error(w, "walletAddress is invalid", http.StatusBadRequest)
		return
	}

	var hasAccess bool
	err := database.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM paid_wallet WHERE wallet_address = $1)", walletAddress).Scan(&hasAccess)
	if err != nil {
		http.Error(w, "Failed to check payment status", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ContentResponse{HasAccess: hasAccess})
}

type RecheckRequest struct {
	Reference     string `json:"reference"`
	WalletAddress string `json:"walletAddress"`
}

type RecheckResponse struct {
	Status string `json:"status"`
}

func RecheckPayment(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST method is allowed", http.StatusMethodNotAllowed)
		return
	}

	var req RecheckRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if !isValidReference(req.Reference) || !isValidWalletAddress(req.WalletAddress) {
		http.Error(w, "reference or walletAddress is invalid", http.StatusBadRequest)
		return
	}

	// Gọi sang watcher để check
	status, err := watcher.ForceRecheckByReference(req.Reference, req.WalletAddress)
	if err != nil {
		// Xử lý lỗi (ví dụ không tìm thấy invoice)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(RecheckResponse{Status: status})
}

func isValidWalletAddress(value string) bool {
	if value == "" {
		return false
	}
	_, err := solana.PublicKeyFromBase58(value)
	return err == nil
}

func isValidReference(reference string) bool {
	_, err := uuid.Parse(reference)
	return err == nil
}
