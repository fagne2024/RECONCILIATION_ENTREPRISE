curl.exe -X POST http://localhost:8080/api/auth/login -H "Content-Type: application/json" --data-binary @login.json -v 2>&1 | findstr "HTTP 401 403 200 error token"
