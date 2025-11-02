(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-NAME u101)
(define-constant ERR-INVALID-LOCATION u102)
(define-constant ERR-PRODUCER-ALREADY-EXISTS u103)
(define-constant ERR-PRODUCER-NOT-FOUND u104)
(define-constant ERR-INVALID-CAPACITY u105)
(define-constant ERR-INVALID-ENERGY-TYPE u106)
(define-constant ERR-INVALID-TIMESTAMP u107)
(define-constant ERR-MAX-PRODUCERS-EXCEEDED u108)
(define-constant ERR-INVALID-STATUS u109)
(define-constant ERR-AUTHORITY-NOT-SET u110)

(define-data-var next-producer-id uint u0)
(define-data-var max-producers uint u10000)
(define-data-var authority-contract (optional principal) none)
(define-data-var registration-fee uint u500)

(define-map producers
  uint
  {
    name: (string-utf8 100),
    location: (string-utf8 100),
    energy-type: (string-utf8 50),
    capacity: uint,
    registration-timestamp: uint,
    status: (string-utf8 20),
    owner: principal
  }
)

(define-map producers-by-name
  (string-utf8 100)
  uint
)

(define-read-only (get-producer (producer-id uint))
  (map-get? producers producer-id)
)

(define-read-only (get-producer-by-name (name (string-utf8 100)))
  (map-get? producers-by-name name)
)

(define-read-only (get-producer-count)
  (ok (var-get next-producer-id))
)

(define-read-only (is-producer-registered (name (string-utf8 100)))
  (ok (is-some (map-get? producers-by-name name)))
)

(define-private (validate-name (name (string-utf8 100)))
  (if (and (> (len name) u0) (<= (len name) u100))
      (ok true)
      (err ERR-INVALID-NAME))
)

(define-private (validate-location (loc (string-utf8 100)))
  (if (and (> (len loc) u0) (<= (len loc) u100))
      (ok true)
      (err ERR-INVALID-LOCATION))
)

(define-private (validate-energy-type (type (string-utf8 50)))
  (if (or (is-eq type u"solar") (is-eq type u"wind") (is-eq type u"hydro"))
      (ok true)
      (err ERR-INVALID-ENERGY-TYPE))
)

(define-private (validate-capacity (capacity uint))
  (if (> capacity u0)
      (ok true)
      (err ERR-INVALID-CAPACITY))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-status (status (string-utf8 20)))
  (if (or (is-eq status u"active") (is-eq status u"pending") (is-eq status u"suspended"))
      (ok true)
      (err ERR-INVALID-STATUS))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (asserts! (is-none (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-registration-fee (new-fee uint))
  (begin
    (asserts! (is-eq tx-sender (unwrap! (var-get authority-contract) (err ERR-AUTHORITY-NOT-SET))) (err ERR-NOT-AUTHORIZED))
    (var-set registration-fee new-fee)
    (ok true)
  )
)

(define-public (register-producer
  (name (string-utf8 100))
  (location (string-utf8 100))
  (energy-type (string-utf8 50))
  (capacity uint)
  (registration-timestamp uint)
)
  (let (
      (producer-id (var-get next-producer-id))
      (current-max (var-get max-producers))
      (authority (unwrap! (var-get authority-contract) (err ERR-AUTHORITY-NOT-SET)))
    )
    (asserts! (< producer-id current-max) (err ERR-MAX-PRODUCERS-EXCEEDED))
    (try! (validate-name name))
    (try! (validate-location location))
    (try! (validate-energy-type energy-type))
    (try! (validate-capacity capacity))
    (try! (validate-timestamp registration-timestamp))
    (asserts! (is-none (map-get? producers-by-name name)) (err ERR-PRODUCER-ALREADY-EXISTS))
    (try! (stx-transfer? (var-get registration-fee) tx-sender authority))
    (map-set producers producer-id
      {
        name: name,
        location: location,
        energy-type: energy-type,
        capacity: capacity,
        registration-timestamp: registration-timestamp,
        status: u"pending",
        owner: tx-sender
      }
    )
    (map-set producers-by-name name producer-id)
    (var-set next-producer-id (+ producer-id u1))
    (print { event: "producer-registered", id: producer-id })
    (ok producer-id)
  )
)

(define-public (update-producer-status
  (producer-id uint)
  (new-status (string-utf8 20))
)
  (let ((producer (map-get? producers producer-id)))
    (match producer
      p
      (begin
        (asserts! (is-eq tx-sender (unwrap! (var-get authority-contract) (err ERR-AUTHORITY-NOT-SET))) (err ERR-NOT-AUTHORIZED))
        (try! (validate-status new-status))
        (map-set producers producer-id
          {
            name: (get name p),
            location: (get location p),
            energy-type: (get energy-type p),
            capacity: (get capacity p),
            registration-timestamp: (get registration-timestamp p),
            status: new-status,
            owner: (get owner p)
          }
        )
        (print { event: "status-updated", id: producer-id, status: new-status })
        (ok true)
      )
      (err ERR-PRODUCER-NOT-FOUND)
    )
  )
)

(define-public (update-producer-details
  (producer-id uint)
  (new-name (string-utf8 100))
  (new-location (string-utf8 100))
  (new-capacity uint)
)
  (let ((producer (map-get? producers producer-id)))
    (match producer
      p
      (begin
        (asserts! (is-eq (get owner p) tx-sender) (err ERR-NOT-AUTHORIZED))
        (try! (validate-name new-name))
        (try! (validate-location new-location))
        (try! (validate-capacity new-capacity))
        (asserts! (or (is-eq new-name (get name p)) (is-none (map-get? producers-by-name new-name))) (err ERR-PRODUCER-ALREADY-EXISTS))
        (map-delete producers-by-name (get name p))
        (map-set producers-by-name new-name producer-id)
        (map-set producers producer-id
          {
            name: new-name,
            location: new-location,
            energy-type: (get energy-type p),
            capacity: new-capacity,
            registration-timestamp: (get registration-timestamp p),
            status: (get status p),
            owner: (get owner p)
          }
        )
        (print { event: "producer-updated", id: producer-id })
        (ok true)
      )
      (err ERR-PRODUCER-NOT-FOUND)
    )
  )
)