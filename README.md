# 🌿 Tokenized Green Energy Certificates

Welcome to a sustainable Web3 solution for corporate green energy compliance! This project uses the Stacks blockchain and Clarity smart contracts to tokenize green energy certificates (RECs), enabling verifiable tracking from energy generation by producers to consumption by corporations. It solves the real-world problem of opaque energy supply chains, where companies struggle to prove their use of renewable energy for regulatory compliance, ESG reporting, and carbon offsetting—reducing fraud, double-counting, and greenwashing through immutable blockchain records.

## ✨ Features
🔋 Mint certificates for verified green energy production  
📊 Track certificate ownership and transfers transparently  
✅ Verify end-to-end provenance from generation to retirement  
🏢 Generate compliance reports for corporate audits  
🚫 Prevent double-spending or fraudulent claims  
🌍 Integrate real-world data via oracles for authenticity  
💼 Support trading and escrow for energy markets  
🛡️ Governance for system updates and dispute resolution  

## 🛠 How It Works
This project involves 8 Clarity smart contracts to handle the full lifecycle of tokenized green energy certificates. Here's a high-level overview:

### Smart Contracts Overview
1. **ProducerRegistry.clar**: Registers verified green energy producers (e.g., solar farms) with credentials and allows updates to their status.  
2. **CertificateMinter.clar**: Enables registered producers to mint non-fungible tokens (NFTs) representing RECs, based on verified energy production data (e.g., kWh generated).  
3. **OracleFeeder.clar**: Integrates off-chain oracles to feed tamper-proof data on energy generation, ensuring minting is backed by real-world metrics.  
4. **TransferHandler.clar**: Manages secure transfers of RECs between producers, intermediaries, and corporate consumers, with ownership tracking.  
5. **RetirementVault.clar**: Allows consumers to "retire" RECs upon consumption, marking them as used to prevent reuse and enable compliance claims.  
6. **ComplianceReporter.clar**: Generates verifiable reports on REC ownership, transfers, and retirements for audits, with query functions for regulators.  
7. **EscrowMarket.clar**: Facilitates peer-to-peer trading of RECs with escrow to ensure fair exchanges and reduce market risks.  
8. **GovernanceDAO.clar**: A DAO for stakeholders to propose and vote on system upgrades, oracle integrations, or dispute resolutions.

**For Energy Producers**  
- Register your facility via ProducerRegistry.clar.  
- Use OracleFeeder.clar to submit verified production data (e.g., from IoT sensors).  
- Call mint-certificate in CertificateMinter.clar with production proof—boom, your REC NFT is created and ready for sale or transfer!

**For Corporate Consumers**  
- Browse available RECs via query functions in TransferHandler.clar or EscrowMarket.clar.  
- Purchase and transfer RECs to your wallet using TransferHandler.clar.  
- Once energy is consumed, retire the REC via RetirementVault.clar to claim it in reports.  
- Use ComplianceReporter.clar to generate an immutable audit trail for ESG filings or regulators.

**For Verifiers/Regulators**  
- Query get-certificate-details in CertificateMinter.clar or verify-ownership in TransferHandler.clar.  
- Check retirement status via RetirementVault.clar.  
- Audit full chains with ComplianceReporter.clar for instant, tamper-proof verification.

This setup ensures full traceability, compliance with standards like RE100 or EU ETS, and fosters a transparent green energy marketplace—all powered by Stacks' secure, Bitcoin-anchored blockchain!