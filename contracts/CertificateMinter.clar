(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-AMOUNT u101)
(define-constant ERR-INVALID-TIMESTAMP u102)
(define-constant ERR-ALREADY-MINTED u103)
(define-constant ERR-PRODUCER-NOT-REGISTERED u104)
(define-constant ERR-ORACLE-NOT-VERIFIED u105)
(define-constant ERR-INVALID-CERT-ID u106)
(define-constant ERR-INVALID-ENERGY-TYPE u107)
(define-constant ERR-INVALID-LOCATION u108)
(define-constant ERR-INVALID-METADATA u109)
(define-constant ERR-MAX-CERTS-EXCEEDED u110)

(define-data-var next-cert-id uint u0)
(define-data-var max-certs uint u100000)
(define-data-var authority-contract (optional principal) none)
(define-data-var producer-registry-contract (optional principal) none)
(define-data-var oracle-contract (optional principal) none)

(define-map certificates
  uint
  {
    energy-amount: uint,
    production-timestamp: uint,
    mint-timestamp: uint,
    producer: principal,
    energy-type: (string-utf8 50),
    location: (string-utf8 100),
    metadata-hash: (string-utf8 256),
    status: (string-utf8 20),
    owner: principal
  }
)

(define-map certificate-by-hash
  (string-utf8 256)
  uint
)

(define-read-only (get-certificate (cert-id uint))
  (map-get? certificates cert-id)
)

(define-read-only (get-certificate-by-hash (hash (string-utf8 256)))
  (map-get? certificate-by-hash hash)
)

(define-read-only (get-cert-count)
  (ok (var-get next-cert-id))
)

(define-read-only (is-cert-registered (hash (string-utf8 256)))
  (ok (is-some (map-get? certificate-by-hash hash)))
)

(define-private (validate-amount (amount uint))
  (if (> amount u0)
      (ok true)
      (err ERR-INVALID-AMOUNT))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-energy-type (type (string-utf8 50)))
  (if (or (is-eq type u"solar") (is-eq type u"wind") (is-eq type u"hydro"))
      (ok true)
      (err ERR-INVALID-ENERGY-TYPE))
)

(define-private (validate-location (loc (string-utf8 100)))
  (if (and (> (len loc) u0) (<= (len loc) u100))
      (ok true)
      (err ERR-INVALID-LOCATION))
)

(define-private (validate-metadata (hash (string-utf8 256)))
  (if (and (> (len hash) u0) (<= (len hash) u256))
      (ok true)
      (err ERR-INVALID-METADATA))
)

(define-private (validate-producer (producer principal))
  (if (is-some (var-get producer-registry-contract))
      (ok true)
      (err ERR-PRODUCER-NOT-REGISTERED))
)

(define-private (validate-oracle (oracle principal))
  (if (is-eq oracle (unwrap! (var-get oracle-contract) (err ERR-ORACLE-NOT-VERIFIED)))
      (ok true)
      (err ERR-ORACLE-NOT-VERIFIED))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (asserts! (is-none (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-producer-registry (contract-principal principal))
  (begin
    (asserts! (is-eq tx-sender (unwrap! (var-get authority-contract) (err ERR-NOT-AUTHORIZED))) (err ERR-NOT-AUTHORIZED))
    (var-set producer-registry-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-oracle-contract (contract-principal principal))
  (begin
    (asserts! (is-eq tx-sender (unwrap! (var-get authority-contract) (err ERR-NOT-AUTHORIZED))) (err ERR-NOT-AUTHORIZED))
    (var-set oracle-contract (some contract-principal))
    (ok true)
  )
)

(define-public (mint-certificate
  (energy-amount uint)
  (production-timestamp uint)
  (energy-type (string-utf8 50))
  (location (string-utf8 100))
  (metadata-hash (string-utf8 256))
  (oracle principal)
)
  (let (
      (cert-id (var-get next-cert-id))
      (current-max (var-get max-certs))
    )
    (asserts! (< cert-id current-max) (err ERR-MAX-CERTS-EXCEEDED))
    (try! (validate-amount energy-amount))
    (try! (validate-timestamp production-timestamp))
    (try! (validate-energy-type energy-type))
    (try! (validate-location location))
    (try! (validate-metadata metadata-hash))
    (try! (validate-producer tx-sender))
    (try! (validate-oracle oracle))
    (asserts! (is-none (map-get? certificate-by-hash metadata-hash)) (err ERR-ALREADY-MINTED))
    (map-set certificates cert-id
      {
        energy-amount: energy-amount,
        production-timestamp: production-timestamp,
        mint-timestamp: block-height,
        producer: tx-sender,
        energy-type: energy-type,
        location: location,
        metadata-hash: metadata-hash,
        status: u"active",
        owner: tx-sender
      }
    )
    (map-set certificate-by-hash metadata-hash cert-id)
    (var-set next-cert-id (+ cert-id u1))
    (print { event: "certificate-minted", id: cert-id })
    (ok cert-id)
  )
)

(define-public (update-certificate-owner
  (cert-id uint)
  (new-owner principal)
)
  (let ((cert (map-get? certificates cert-id)))
    (match cert
      c
      (begin
        (asserts! (is-eq (get owner c) tx-sender) (err ERR-NOT-AUTHORIZED))
        (asserts! (is-eq (get status c) u"active") (err ERR-INVALID-CERT-ID))
        (map-set certificates cert-id
          {
            energy-amount: (get energy-amount c),
            production-timestamp: (get production-timestamp c),
            mint-timestamp: (get mint-timestamp c),
            producer: (get producer c),
            energy-type: (get energy-type c),
            location: (get location c),
            metadata-hash: (get metadata-hash c),
            status: (get status c),
            owner: new-owner
          }
        )
        (print { event: "owner-updated", id: cert-id, new-owner: new-owner })
        (ok true)
      )
      (err ERR-INVALID-CERT-ID)
    )
  )
)