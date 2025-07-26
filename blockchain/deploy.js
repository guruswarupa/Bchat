
const { Web3 } = require('web3');
const fs = require('fs');
const solc = require('solc');

async function deployContract() {
  try {
    // Connect to Ganache
    const web3Provider = process.env.WEB3_PROVIDER || 'http://localhost:8545';
    const web3 = new Web3(web3Provider);
    
    // Test connection
    const networkId = await web3.eth.net.getId();
    console.log('Connected to network ID:', networkId);
    
    // Read the contract source code
    const contractSource = fs.readFileSync('./ChatContract.sol', 'utf8');
    
    // Compile the contract with specific settings
    const input = {
      language: 'Solidity',
      sources: {
        'ChatContract.sol': {
          content: contractSource,
        },
      },
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        },
        outputSelection: {
          '*': {
            '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'],
          },
        },
      },
    };
    
    console.log('Compiling contract...');
    const compiled = JSON.parse(solc.compile(JSON.stringify(input)));
    
    // Check for compilation errors
    if (compiled.errors) {
      compiled.errors.forEach(error => {
        if (error.severity === 'error') {
          console.error('Compilation error:', error.formattedMessage);
        } else {
          console.warn('Compilation warning:', error.formattedMessage);
        }
      });
      if (compiled.errors.some(error => error.severity === 'error')) {
        throw new Error('Contract compilation failed');
      }
    }
    
    const contract = compiled.contracts['ChatContract.sol']['ChatContract'];
    
    if (!contract) {
      throw new Error('Contract not found in compilation output');
    }

    if (!contract.evm || !contract.evm.bytecode || !contract.evm.bytecode.object) {
      throw new Error('Contract bytecode not found');
    }
    
    // Get accounts
    const accounts = await web3.eth.getAccounts();
    if (accounts.length === 0) {
      throw new Error('No accounts available');
    }
    
    console.log('Using account:', accounts[0]);
    
    // Check account balance
    const balance = await web3.eth.getBalance(accounts[0]);
    console.log('Account balance:', web3.utils.fromWei(balance, 'ether'), 'ETH');
    
    // Get gas price
    const gasPrice = await web3.eth.getGasPrice();
    console.log('Gas price:', gasPrice);
    
    // Create contract instance
    const contractInstance = new web3.eth.Contract(contract.abi);
    
    // Prepare deployment
    const deployData = contractInstance.deploy({
      data: '0x' + contract.evm.bytecode.object,
    });
    
    // Estimate gas with a simpler approach
    console.log('Estimating gas...');
    const gasEstimate = await web3.eth.estimateGas({
      from: accounts[0],
      data: '0x' + contract.evm.bytecode.object,
    });
    
    console.log('Estimated gas:', gasEstimate);
    
    // Deploy the contract with explicit gas limit
    console.log('Deploying contract...');
    const deployedContract = await deployData.send({
      from: accounts[0],
      gas: Math.floor(Number(gasEstimate) * 1.2), // Add 20% buffer
      gasPrice: Number(gasPrice),
    });
    
    console.log('Contract deployed successfully!');
    console.log('Contract address:', deployedContract.options.address);
    
    // Save contract info
    const contractInfo = {
      address: deployedContract.options.address,
      abi: contract.abi,
      networkId: networkId.toString(),
      deployedAt: new Date().toISOString()
    };
    
    fs.writeFileSync('./contract-info.json', JSON.stringify(contractInfo, null, 2));
    console.log('Contract info saved to contract-info.json');
    
    // Test the deployed contract
    console.log('Testing contract...');
    const testContract = new web3.eth.Contract(contract.abi, deployedContract.options.address);
    
    // Try to call a view function
    try {
      const exists = await testContract.methods.messageExists('test').call();
      console.log('Contract test successful - messageExists returned:', exists);
    } catch (testError) {
      console.warn('Contract test failed:', testError.message);
    }
    
    return deployedContract;
    
  } catch (error) {
    console.error('Deployment failed:', error.message);
    if (error.cause) {
      console.error('Cause:', error.cause.message);
    }
    process.exit(1);
  }
}

deployContract();
