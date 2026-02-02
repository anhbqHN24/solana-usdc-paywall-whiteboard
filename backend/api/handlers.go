package api

import (
	"encoding/json"
	"net/http"
	"solana_paywall/backend/database"
	"solana_paywall/backend/watcher"

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
	if req.WalletAddress == "" {
		http.Error(w, "walletAddress is required", http.StatusBadRequest)
		return
	}

	reference := uuid.New().String()
	amount := 10_000_000 // 10 USDC (6 decimal places)

	_, err := database.DB.Exec("INSERT INTO invoice (wallet_address, reference, amount) VALUES ($1, $2, $3)", req.WalletAddress, reference, amount)
	if err != nil {
		http.Error(w, "Failed to create invoice", http.StatusInternalServerError)
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
	if req.Reference == "" || req.Signature == "" {
		http.Error(w, "reference and signature are required", http.StatusBadRequest)
		return
	}

	_, err := database.DB.Exec("UPDATE invoice SET signature = $1 WHERE reference = $2", req.Signature, req.Reference)
	if err != nil {
		http.Error(w, "Failed to update invoice", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func GetContent(w http.ResponseWriter, r *http.Request) {
	walletAddress := r.URL.Query().Get("walletAddress")
	if walletAddress == "" {
		http.Error(w, "walletAddress is required", http.StatusBadRequest)
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
	Reference string `json:"reference"`
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

	// Gọi sang watcher để check
	status, err := watcher.ForceRecheckByReference(req.Reference)
	if err != nil {
		// Xử lý lỗi (ví dụ không tìm thấy invoice)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(RecheckResponse{Status: status})
}
