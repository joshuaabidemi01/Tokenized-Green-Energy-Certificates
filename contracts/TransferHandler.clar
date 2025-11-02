(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-CERT-ID u101)
(define-constant ERR-CERT-NOT-ACTIVE u102)
(define-constant ERR-INVALID-RECEIVER u103)
(define-constant ERR-AUTHORITY-NOT-SET u104)
(define-constant ERR-MINTER-NOT-SET u105)
(define-constant ERR-INVALID-TIMESTAMP u106)
(define-constant ERR-ALREADY-LOCKED u107)
(define-constant ERR-NOT-LOCKED u108)
(define-constant ERR-INVALID-FEE u109)

(define-data-var authority-contract (optional principal) none)
(define-data-var minter-contract (optional principal) none)
(define-data-var transfer-fee uint u100)

(define-map transfer-locks
  uint
  {
    cert-id: uint,
    sender: principal,
    receiver: principal,
    timestamp: uint,
    status: (string-utf8 20)
  }
)

(define-read-only (get-transfer-lock (cert-id uint))
  (map-get? transfer-locks cert-id)
)

(define-read-only (get-transfer-fee)
  (ok (var-get transfer-fee))
)

(define-read-only (is-cert-locked (cert-id uint))
  (ok (is-some (map-get? transfer-locks cert-id)))
)

(define-private (validate-cert-id (cert-id uint))
  (if (>= cert-id u0)
      (ok true)
      (err ERR-INVALID-CERT-ID))
)

(define-private (validate-receiver (receiver principal))
  (if (not (is-eq receiver tx-sender))
      (ok true)
      (err ERR-INVALID-RECEIVER))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-cert-status (cert { energy-amount: uint, production-timestamp: uint, mint-timestamp: uint, producer: principal, energy-type: (string-utf8 50), location: (string-utf8 100), metadata-hash: (string-utf8 256), status: (string-utf8 20), owner: principal }))
  (if (is-eq (get status cert) u"active")
      (ok true)
      (err ERR-CERT-NOT-ACTIVE))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (asserts! (is-none (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-minter-contract (contract-principal principal))
  (begin
    (asserts! (is-eq tx-sender (unwrap! (var-get authority-contract) (err ERR-AUTHORITY-NOT-SET))) (err ERR-NOT-AUTHORIZED))
    (var-set minter-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-transfer-fee (new-fee uint))
  (begin
    (asserts! (is-eq tx-sender (unwrap! (var-get authority-contract) (err ERR-AUTHORITY-NOT-SET))) (err ERR-NOT-AUTHORIZED))
    (asserts! (>= new-fee u0) (err ERR-INVALID-FEE))
    (var-set transfer-fee new-fee)
    (ok true)
  )
)

(define-public (lock-transfer
  (cert-id uint)
  (receiver principal)
  (timestamp uint)
)
  (let (
      (minter (unwrap! (var-get minter-contract) (err ERR-MINTER-NOT-SET)))
      (cert (unwrap! (contract-call? minter get-certificate cert-id) (err ERR-INVALID-CERT-ID)))
    )
    (try! (validate-cert-id cert-id))
    (try! (validate-receiver receiver))
    (try! (validate-timestamp timestamp))
    (try! (validate-cert-status cert))
    (asserts! (is-eq (get owner cert) tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-none (map-get? transfer-locks cert-id)) (err ERR-ALREADY-LOCKED))
    (map-set transfer-locks cert-id
      {
        cert-id: cert-id,
        sender: tx-sender,
        receiver: receiver,
        timestamp: block-height,
        status: u"locked"
      }
    )
    (print { event: "transfer-locked", cert-id: cert-id, receiver: receiver })
    (ok true)
  )
)

(define-public (execute-transfer (cert-id uint))
  (let (
      (minter (unwrap! (var-get minter-contract) (err ERR-MINTER-NOT-SET)))
      (lock (unwrap! (map-get? transfer-locks cert-id) (err ERR-NOT-LOCKED)))
      (authority (unwrap! (var-get authority-contract) (err ERR-AUTHORITY-NOT-SET)))
    )
    (asserts! (is-eq (get sender lock) tx-sender) (err ERR-NOT-AUTHORIZED))
    (try! (stx-transfer? (var-get transfer-fee) tx-sender authority))
    (try! (contract-call? minter update-certificate-owner cert-id (get receiver lock)))
    (map-set transfer-locks cert-id
      {
        cert-id: cert-id,
        sender: (get sender lock),
        receiver: (get receiver lock),
        timestamp: (get timestamp lock),
        status: u"executed"
      }
    )
    (print { event: "transfer-executed", cert-id: cert-id, receiver: (get receiver lock) })
    (ok true)
  )
)

(define-public (cancel-transfer (cert-id uint))
  (let ((lock (unwrap! (map-get? transfer-locks cert-id) (err ERR-NOT-LOCKED))))
    (asserts! (is-eq (get sender lock) tx-sender) (err ERR-NOT-AUTHORIZED))
    (map-set transfer-locks cert-id
      {
        cert-id: cert-id,
        sender: (get sender lock),
        receiver: (get receiver lock),
        timestamp: (get timestamp lock),
        status: u"cancelled"
      }
    )
    (print { event: "transfer-cancelled", cert-id: cert-id })
    (ok true)
  )
)