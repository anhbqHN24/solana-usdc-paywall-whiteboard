# Nạp file .env
ifneq (,$(wildcard ./.env))
    include .env
    export
endif

# Lệnh chạy Up
migrate-up:
	migrate -path migrations -database $(DATABASE_URL) up

# Lệnh chạy Down 1 bước
migrate-down:
	migrate -path migrations -database $(DATABASE_URL) down 1

# Lệnh tạo file migration mới (VD: make migrate-create name=add_users_table)
migrate-create:
	migrate create -ext sql -dir migrations -seq $(name)
