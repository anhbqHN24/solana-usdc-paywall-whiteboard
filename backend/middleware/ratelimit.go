package middleware

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Rate Limit configuration
const (
	RequestLimit = 5               // Maximum hit request
	WindowSize   = 1 * time.Minute // In this window time range
)

type ClientState struct {
	Count       int
	WindowStart time.Time
}

var (
	clients = make(map[string]*ClientState)
	mu      sync.Mutex
)

// Lấy IP thật của user (hỗ trợ cả khi đứng sau Proxy/Load Balancer)
func getRealIP(r *http.Request) string {
	// Check header X-Forwarded-For trước
	forwarded := r.Header.Get("X-Forwarded-For")
	if forwarded != "" {
		return strings.Split(forwarded, ",")[0]
	}
	// Fallback về RemoteAddr
	ip, _, _ := net.SplitHostPort(r.RemoteAddr)
	return ip
}

// Hàm dọn dẹp bộ nhớ định kỳ để tránh memory leak
func init() {
	go func() {
		for {
			time.Sleep(10 * time.Minute)
			mu.Lock()
			for ip, client := range clients {
				if time.Since(client.WindowStart) > WindowSize {
					delete(clients, ip)
				}
			}
			mu.Unlock()
		}
	}()
}

// Middleware RateLimit
func RateLimit(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ip := getRealIP(r)

		mu.Lock()
		client, exists := clients[ip]

		if !exists || time.Since(client.WindowStart) > WindowSize {
			// Nếu là IP mới hoặc đã qua khung thời gian cũ -> Reset
			clients[ip] = &ClientState{
				Count:       1,
				WindowStart: time.Now(),
			}
			mu.Unlock()
			next(w, r)
			return
		}

		if client.Count >= RequestLimit {
			// Quá giới hạn
			mu.Unlock()
			http.Error(w, "Too many requests. Please try again later.", http.StatusTooManyRequests)
			return
		}

		// Tăng biến đếm
		client.Count++
		mu.Unlock()

		next(w, r)
	}
}
