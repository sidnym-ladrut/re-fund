# `re-fund` Contracts

## Usage

### Running Tests

To run all the tests in the project, execute the following command:

```shell
npx hardhat test
```

You can also selectively run the Solidity or `node:test` tests:

```shell
npx hardhat test solidity
npx hardhat test nodejs
```

### Deploying/Testing Locally

To run the deployment to a local chain:

```shell
npx hardhat ignition deploy --network localhost ignition/modules/FundFactory.ts
npx hardhat ignition deploy --network localhost ignition/modules/FundToken.ts
```

To create a test environment with a ready-made fund (runs the above automatically):

```shell
npx hardhat run --no-compile scripts/DeployTestEnv.ts
```

To synchronize the contract ABIs to the dApp:

```shell
npx hardhat run --no-compile scripts/SyncAbis.ts
```

### Deploying to Testnet

To run the deployment to Sepolia:

```shell
npx hardhat keystore set SEPOLIA_RPC_URL
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
npx hardhat ignition deploy --network sepolia ignition/modules/FundFactory.ts
npx hardhat ignition deploy --network sepolia ignition/modules/FundToken.ts
```

Then, optionally to verify it on Etherscan:

```shell
npx hardhat keystore set ETHERSCAN_API_KEY
npx hardhat ignition verify --network sepolia chain-11155111
npx hardhat ignition deploy --verify --network sepolia ignition/modules/FundFactory.ts
npx hardhat ignition deploy --verify --network sepolia ignition/modules/FundToken.ts
```
