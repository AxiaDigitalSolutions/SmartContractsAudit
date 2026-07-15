# Smart Contracts - Credit Core Tokenization

## Contracts

### ERC20TrancheToken.sol
ERC-20 token for investor positions in credit deals/tranches.

**Features:**
- Mintable/Burnable by authorized roles
- Pausable for emergency stops
- Whitelist support
- Transfer restrictions

**Deployment:**
```solidity
constructor(
    string memory name,      // e.g., "Deal POOL_A_SENIOR_2026"
    string memory symbol,    // e.g., "POOL-A-SENIOR"
    address admin            // Platform admin address
)
```

**Usage:**
- One contract per tranche/series (recommended)
- Or one contract per deal with multiple tranches

### ERC1155ReceivableToken.sol
ERC-1155 token for receivable/charge assets.

**Features:**
- One token per receivable/charge (tokenId = receivable_id or charge_id)
- Mintable/Burnable by authorized roles
- Pausable for emergency stops
- Metadata URI support (IPFS)
- Whitelist support
- Transfer restrictions

**Deployment:**
```solidity
constructor(
    string memory baseURI_,  // Base URI for metadata (e.g., "https://ipfs.io/ipfs/")
    address admin            // Platform admin address
)
```

**Usage:**
- Single contract for all receivables
- Each receivable = unique tokenId
- Metadata stored off-chain (IPFS) with hash on-chain

## Compilation Instructions

### Prerequisites
- Node.js 18+
- npm or yarn

### How to Compile

1. Navigate to the smart-contracts folder:
```bash
cd Common/Backend/CreditCoreService/packages/processor/smart-contracts
```

2. Install dependencies:
```bash
npm install
```

3. Compile contracts:
```bash
npm run compile
```

4. After compilation, copy the artifacts to the JSON files:
```bash
# Copy ERC20TrancheToken
cp artifacts/ERC20TrancheToken.sol/ERC20TrancheToken.json ./ERC20TrancheToken.json

# Copy ERC1155ReceivableToken  
cp artifacts/ERC1155ReceivableToken.sol/ERC1155ReceivableToken.json ./ERC1155ReceivableToken.json
```

**IMPORTANT:** The JSON files must contain valid `bytecode` and `abi` fields for deployment to work.

## Deployment Instructions

### Deployment Steps (via BackOffice)

3. Deploy ERC-20 (for investor positions):
```javascript
const ERC20TrancheToken = await ethers.getContractFactory("ERC20TrancheToken");
const token = await ERC20TrancheToken.deploy(
    "Deal POOL_A_SENIOR_2026",
    "POOL-A-SENIOR",
    adminAddress
);
await token.deployed();
```

4. Deploy ERC-1155 (for receivables):
```javascript
const ERC1155ReceivableToken = await ethers.getContractFactory("ERC1155ReceivableToken");
const token = await ERC1155ReceivableToken.deploy(
    "https://ipfs.io/ipfs/",
    adminAddress
);
await token.deployed();
```

5. Configure in BackOffice:
- Create token project
- Set contract address
- Set chain ID
- Configure whitelist/restrictions

## Security Considerations

- Admin keys stored in secure vault (AWS Secrets Manager)
- Whitelist enforced for regulated scenarios
- Pausable for emergency stops
- Access control with role-based permissions
- Transfer restrictions configurable per project

## Integration

After deployment, update `token_projects` table:
- Set `contract_address`
- Set `status = 'DEPLOYED'` or `'ACTIVE'`
- Configure whitelist addresses
- Set transfer restrictions
