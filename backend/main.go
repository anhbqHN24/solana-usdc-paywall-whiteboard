package main

import (
	"log"
	"net/http"
	"solana_paywall/backend/api"
	"solana_paywall/backend/database"
	"solana_paywall/backend/watcher"
)

func main() {
	database.Connect()
	watcher.Start()

	http.HandleFunc("/api/content", api.GetContent)
	http.HandleFunc("/api/invoice", api.CreateInvoice)
	http.HandleFunc("/api/invoice/confirm", api.ConfirmInvoice)

	log.Println("Server starting on port 8080...")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal(err)
	}
}
