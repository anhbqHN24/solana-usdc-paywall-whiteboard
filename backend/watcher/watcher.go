package watcher

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"solana_paywall/backend/database"
	"strconv"
	"strings"
	"time"
)

// ... (Transaction and Invoice structs remain the same) ...
// Transaction models the structure of the JSON output from get_transaction.js
type ParsedInfo struct {
	Source      string `json:"source"`
	Destination string `json:"destination"`
	Amount      string `json:"amount"`
	Authority   string `json:"authority"`
}

type ParsedInstruction struct {
	Program string          `json:"program"`
	Parsed  json.RawMessage `json:"parsed"`
}

type SplTokenParsedData struct {
	Type string     `json:"type"`
	Info ParsedInfo `json:"info"`
}

type TransactionData struct {
	Transaction struct {
		Message struct {
			Instructions []ParsedInstruction `json:"instructions"`
		} `json:"message"`
	} `json:"transaction"`
	Meta struct {
		LogMessages []string    `json:"logMessages"`
		Err         interface{} `json:"err"`
	} `json:"meta"`
}

type VerificationData struct {
	Transaction TransactionData `json:"transaction"`
	MerchantAta string          `json:"merchantAta"`
}

type Invoice struct {
	// ... (Invoice struct remains the same) ...
	ID            int64
	WalletAddress string
	Reference     string
	Signature     sql.NullString
	Amount        int64
	Status        string
	CreatedAt     time.Time
	RetryCount    int
	LastRetryAt   sql.NullTime
}

// ... (Start and checkPendingPayments functions remain the same) ...
func Start() {
	log.Println("Starting transaction watcher...")
	go func() {
		ticker := time.NewTicker(10 * time.Second) // Check every 10 seconds
		defer ticker.Stop()

		for range ticker.C {
			checkPendingPayments()
		}
	}()
}
func checkPendingPayments() {
	// The interval is in seconds, calculated as 2^retry_count, capped at 8 for interval calculation to prevent very long waits.
	// A base of 10 seconds is added to the interval.
	rows, err := database.DB.Query(`
		SELECT id, wallet_address, reference, signature, amount, status, created_at, retry_count, last_retry_at
		FROM invoice
		WHERE status = 'pending' AND signature IS NOT NULL
		AND (
			last_retry_at IS NULL
			OR
			last_retry_at < NOW() - (interval '10 seconds' * power(2, LEAST(retry_count, 8)))
		)
	`)
	if err != nil {
		log.Printf("Error querying pending invoices: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var invoice Invoice
		if err := rows.Scan(&invoice.ID, &invoice.WalletAddress, &invoice.Reference, &invoice.Signature, &invoice.Amount, &invoice.Status, &invoice.CreatedAt, &invoice.RetryCount, &invoice.LastRetryAt); err != nil {
			log.Printf("Error scanning invoice row: %v", err)
			continue
		}

		// Process invoices one by one to avoid overwhelming the RPC
		err = verifyAndCompleteTransaction(invoice)
		if err != nil {
			if strings.Contains(err.Error(), "Transaction not found") {
				handleTransactionNotFound(invoice, err)
			} else {
				log.Printf("Error verifying transaction for invoice %d: %v. Marking as failed.", invoice.ID, err)
				updateInvoiceStatus(invoice.ID, "failed")
			}
		}
	}
}

func handleTransactionNotFound(invoice Invoice, err error) {
	const maxRetries = 2
	if invoice.RetryCount >= maxRetries {
		log.Printf("Invoice %d exceeded max retries. Marking as failed. (Hint: Transaction might not have been sent by frontend)", invoice.ID)
		updateInvoiceStatus(invoice.ID, "failed")
		return
	}

	// Increment retry count and update last_retry_at timestamp.
	_, dbErr := database.DB.Exec(`
		UPDATE invoice
		SET retry_count = retry_count + 1, last_retry_at = NOW()
		WHERE id = $1
	`, invoice.ID)

	if dbErr != nil {
		log.Printf("Error updating retry count for invoice %d: %v", invoice.ID, dbErr)
	} else {
		// Log originalErr để thấy lỗi thực sự từ JS script
		log.Printf("Transaction not found for invoice %d. Retrying later. Retry attempt %d. Details: %v", invoice.ID, invoice.RetryCount+1, err)
	}
}

func updateInvoiceStatus(invoiceID int64, status string) {
	_, err := database.DB.Exec("UPDATE invoice SET status = $1 WHERE id = $2", status, invoiceID)
	if err != nil {
		log.Printf("Error updating invoice %d status to %s: %v", invoiceID, status, err)
	}
}

func verifyAndCompleteTransaction(invoice Invoice) error {
	log.Printf("Checking transaction for invoice %d with signature %s", invoice.ID, invoice.Signature.String)

	merchantWallet := os.Getenv("MERCHANT_WALLET")
	usdcMint := os.Getenv("USDC_MINT")
	if merchantWallet == "" || usdcMint == "" {
		return errors.New("MERCHANT_WALLET or USDC_MINT environment variable is not set")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// --- 1. LOGIC MỚI: Check timeout 5 phút ngay từ đầu ---
	// Nếu thời gian hiện tại - thời gian tạo > 5 phút (cộng thêm chút buffer 10s cho mạng)
	if time.Since(invoice.CreatedAt) > 5*time.Minute+10*time.Second {
		log.Printf("Invoice %d expired (timeout > 5 mins). Marking as failed.", invoice.ID)
		updateInvoiceStatus(invoice.ID, "failed")
		return nil // Dừng check, coi như xong
	}

	cmd := exec.CommandContext(ctx, "node", "watcher/get_transaction.js", invoice.Signature.String, merchantWallet, usdcMint)
	cmd.Env = os.Environ() // Pass parent environment

	log.Printf("Executing command: %s", cmd.String())

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("error executing get_transaction.js: %w\nOutput: %s", err, string(output))
	}

	log.Printf("Output from get_transaction.js: %s", string(output))

	var data VerificationData
	if err := json.Unmarshal(output, &data); err != nil {
		return fmt.Errorf("error parsing verification data: %w", err)
	}

	// 1. Kiểm tra lỗi On-Chain
	if data.Transaction.Meta.Err != nil {
		log.Printf("Transaction failed on-chain: %v", data.Transaction.Meta.Err)
		return errors.New("payment verification failed: transaction failed on-chain")
	}

	// 1. Verify memo
	memoFound := false

	// Cách 1: Tìm trong Log (Cho Memo v2 hoặc program log)
	expectedMemoPrefix := "Program log: Memo"
	for _, msg := range data.Transaction.Meta.LogMessages {
		if strings.HasPrefix(msg, expectedMemoPrefix) && strings.Contains(msg, invoice.Reference) {
			memoFound = true
			break
		}
	}

	// Cách 2: Tìm trong Instruction Parsed Data (Cho Memo v1 - QUAN TRỌNG)
	if !memoFound {
		for _, inst := range data.Transaction.Transaction.Message.Instructions {
			if inst.Program == "spl-memo" {
				// Memo v1: "parsed" field là một string trực tiếp
				var memoText string
				if err := json.Unmarshal(inst.Parsed, &memoText); err == nil {
					if memoText == invoice.Reference {
						memoFound = true
						break
					}
				}
			}
		}
	}

	if !memoFound {
		return fmt.Errorf("payment verification failed: memo '%s' not found", invoice.Reference)
	}

	// 3. Tìm Instruction Transfer hợp lệ
	transferFound := false
	for _, inst := range data.Transaction.Transaction.Message.Instructions {
		// Chỉ quan tâm instruction của token program
		if inst.Program == "spl-token" {
			// Parse nội dung instruction object
			var tokenData SplTokenParsedData
			if err := json.Unmarshal(inst.Parsed, &tokenData); err != nil {
				continue
			}

			if tokenData.Type == "transfer" {
				amount, err := strconv.ParseInt(tokenData.Info.Amount, 10, 64)
				if err != nil {
					continue
				}

				if tokenData.Info.Authority == merchantWallet {
					log.Printf("Security Alert: Self-payment detected for invoice %d. Merchant wallet is sender.", invoice.ID)
					// Đánh dấu failed luôn để chặn gian lận
					updateInvoiceStatus(invoice.ID, "failed")
					return errors.New("security violation: merchant self-payment not allowed")
				}

				isCorrectDestination := tokenData.Info.Destination == data.MerchantAta
				isCorrectAmount := amount == invoice.Amount

				if isCorrectDestination && isCorrectAmount {
					transferFound = true
					break
				}
			}
		}
	}

	if !transferFound {
		return errors.New("payment verification failed: no matching SPL transfer found")
	}

	// 4. Success
	updateInvoiceStatus(invoice.ID, "paid")
	log.Printf("Payment confirmed for invoice %d", invoice.ID)
	return nil
}
