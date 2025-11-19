# Oracle Signature Explained

## What is the Oracle Signature?

The **oracle signature** is a cryptographic proof that the oracle has reviewed and approved the fund's project terms. It's NOT the oracle's address - it's a digital signature created using the oracle's private key.

## How It Works

### 1. Oracle Signs the Terms (Sign Off)

When the oracle clicks "Sign Off":

```typescript
// Oracle signs the termsCID (the hash of project terms)
const signature = await signMessage({
  account: oracleAddress,
  message: { raw: termsCID }, // e.g., "0xb68a9e707bc94580080b99b709add9b5938c58f728e0bc48b24721676389a8ee"
});

// Result: "0xfb124da6a1aec108f6a4846d9f1d4e4780a4af08d43d4464537fda3d077c2e1261614e1475a504a59d6b36a1073932e810e4d409a0547e908321c8e2649fd6e01b"
```

**Signature Structure (132 characters):**
- `0x` prefix (2 chars)
- `r` component (64 chars / 32 bytes) - part of ECDSA signature
- `s` component (64 chars / 32 bytes) - part of ECDSA signature  
- `v` recovery id (2 chars / 1 byte) - helps recover public key

Total: **65 bytes** or **132 hex characters** (excluding `0x`)

### 2. Worker Locks the Fund (Lock In)

The worker submits the signature to the smart contract:

```typescript
// Worker calls lockTerms with the oracle's signature
await fundContract.lockTerms(oracleSignature);
```

### 3. Contract Verification

The smart contract verifies the signature:

```solidity
function lockTerms(bytes calldata oracleSignature) external onlyOwner beforeLocked {
    // Recover the signer's address from signature
    address recoveredSigner = ECDSA.recover(
        MessageHashUtils.toEthSignedMessageHash(termsCID),
        oracleSignature
    );
    
    // Verify it matches the oracle
    require(recoveredSigner == oracle, "Invalid signature");
    
    // Lock the fund
    termsSignature = oracleSignature;
}
```

## Why This is Secure

1. **Only the oracle can create this signature**
   - Requires the oracle's private key
   - Cannot be forged or created by anyone else

2. **Signature is bound to specific terms**
   - Signs the exact `termsCID` hash
   - Cannot be reused for different fund terms
   - If terms change, signature becomes invalid

3. **Cryptographic verification**
   - Uses ECDSA (Elliptic Curve Digital Signature Algorithm)
   - Same cryptography that secures Ethereum transactions
   - Mathematically proven security

4. **Prevents fraud**
   - Worker can't lock fund without oracle approval
   - Oracle can't deny signing (signature is proof)
   - Terms can't be changed after signing

## UX Improvements

### Before (Manual Copy/Paste)
1. Oracle clicks "Sign Off"
2. Popup shows signature
3. Oracle copies signature manually
4. Oracle sends to worker (or worker pastes from prompt)
5. Worker pastes into input field
6. Worker clicks "Lock In"

**Problem:** Prompt dialog doesn't always show without DevTools open

### After (Auto-Fill)
1. Oracle clicks "Sign Off"
2. Signature automatically fills the input field
3. Alert confirms: "Signature generated and filled!"
4. Worker simply clicks "Lock In"

**Benefits:**
- No manual copy/paste needed
- Works reliably without DevTools
- Cleaner UX
- Fewer steps

## Example Signature

```
0xfb124da6a1aec108f6a4846d9f1d4e4780a4af08d43d4464537fda3d077c2e12
  61614e1475a504a59d6b36a1073932e810e4d409a0547e908321c8e2649fd6e0
  1b
```

Breaking it down:
- `fb124da6...077c2e12` ← r component (64 hex chars)
- `61614e14...9fd6e0` ← s component (64 hex chars)
- `1b` ← v recovery id (2 hex chars)

## Technical Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Oracle Reviews Fund Terms                                │
│    termsCID = "0xb68a9e707bc94580080b99b709add9b5938c5..."  │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Oracle Signs with Private Key (MetaMask)                 │
│    signature = sign(termsCID, oraclePrivateKey)             │
│    Result: "0xfb124da6...1b" (132 chars)                    │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Auto-Fill Input Field                                    │
│    setOracleSign(signature)                                 │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Worker Submits to Contract                               │
│    lockTerms(signature)                                     │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Contract Verifies Signature                              │
│    recoveredAddress = ecrecover(hash, signature)            │
│    require(recoveredAddress == oracle)                      │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. Fund Locked! ✅                                           │
│    termsSignature = signature (stored on-chain)             │
│    Fund ready to accept deposits                            │
└─────────────────────────────────────────────────────────────┘
```

## Common Questions

### Q: Can the worker fake the signature?
**A:** No. The signature requires the oracle's private key, which only the oracle controls.

### Q: Can the signature be reused for other funds?
**A:** No. Each signature is bound to a specific `termsCID`. Different terms = different hash = invalid signature.

### Q: What if the oracle changes their mind?
**A:** Once signed, the signature is cryptographic proof. However, if terms need to change, the fund must be refunded and recreated with new terms.

### Q: Is this the same as signing a transaction?
**A:** Similar concept! Both use ECDSA signatures, but this is an **off-chain signature** (EIP-191) for data, not a transaction signature.

### Q: Why not just use the oracle's address?
**A:** An address is public information - anyone could submit it. The signature proves the oracle actively approved the terms.

## Related Standards

- **EIP-191**: Signed Data Standard (what we use)
- **ECDSA**: Elliptic Curve Digital Signature Algorithm
- **EIP-712**: Typed structured data hashing and signing (used for withdrawal signatures)

---

**Security Note:** Never share your private key! Signatures are safe to share publicly - they can only be used for their specific purpose (verifying oracle approval).
