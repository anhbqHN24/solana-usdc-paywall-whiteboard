package database

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"
	_ "github.com/jackc/pgx/v4/stdlib"
)

var DB *sql.DB

func Connect() {
	err := godotenv.Load()
	if err != nil {
		log.Println("No .env file found")
	}

	connStr := os.Getenv("DATABASE_URL")
	if connStr == "" {
		log.Fatal("DATABASE_URL is not set")
	}

	db, err := sql.Open("pgx", connStr)
	if err != nil {
		log.Fatal(fmt.Errorf("unable to connect to database: %w", err))
	}

	if err = db.Ping(); err != nil {
		log.Fatal(fmt.Errorf("unable to ping database: %w", err))
	}

	DB = db
	log.Println("Database connection successful")
}
