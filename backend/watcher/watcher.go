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
		LogMessages []string `json:"logMessages"`
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

		for {
			select {
			case <-ticker.C:
				checkPendingPayments()
			}
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
	const maxRetries = 3
	if invoice.RetryCount >= maxRetries {
		log.Printf("Invoice %d exceeded max retries. Marking as failed. (Hint: Transaction might not have been sent by frontend)", invoice.ID)
		updateInvoiceStatus(invoice.ID, "failed")
		return
	}

	// Increment retry count and update last_retry_at timestamp.
	_, err = database.DB.Exec(`
		UPDATE invoice
		SET retry_count = retry_count + 1, last_retry_at = NOW()
		WHERE id = $1
	`, invoice.ID)

	if err != nil {
		log.Printf("Error updating retry count for invoice %d: %v", invoice.ID, err)
	} else {
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

	// 1. Verify memo
	memoFound := false
	expectedMemoPrefix := "Program log: Memo" // The memo program log is slightly different
	for _, msg := range data.Transaction.Meta.LogMessages {
		if strings.HasPrefix(msg, expectedMemoPrefix) && strings.Contains(msg, invoice.Reference) {
			memoFound = true
			break
		}
	}
	if !memoFound {
		return fmt.Errorf("verification failed: memo '%s' not found", invoice.Reference)
	}

	// 2. Find the correct transfer instruction and verify it
	for _, inst := range data.Transaction.Transaction.Message.Instructions {
		if inst.Type == "spl-token" || inst.Type == "transfer" {
			info := inst.Info
			amount, err := strconv.ParseInt(info.Amount, 10, 64)
			if err != nil {
				continue
			}

			// Perform all checks for this instruction
			isCorrectDestination := info.Destination == data.MerchantAta
			isCorrectAmount := amount == invoice.Amount

			if isCorrectDestination && isCorrectAmount {
				// 3. All checks passed, update database
				updateInvoiceStatus(invoice.ID, "paid")
				log.Printf("Payment confirmed for invoice %d", invoice.ID)
				return nil // Success
			}
		}
	}

	return errors.New("payment verification failed: no matching and valid SPL transfer found")
}
