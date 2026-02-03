package main

import (
	"log"
	"net/http"
	"solana_paywall/backend/api"
	"solana_paywall/backend/database"
)

func main() {
	database.Connect()

	http.HandleFunc("/api/content", api.GetContent)
	http.HandleFunc("/api/invoice", api.CreateInvoice)

	log.Println("Server starting on port 8080...")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal(err)
	}
}
