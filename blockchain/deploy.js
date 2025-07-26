// deploy.js
const { Web3 } = require('web3');
const fs = require('fs');
const solc = require('solc');

async function deployChatContract() {
  try {
    const web3Provider = process.env.WEB3_PROVIDER || 'http://localhost:8545';
    const web3 = new Web3(web3Provider);

    const networkId = await web3.eth.net.getId();
    console.log('Connected to network ID:', networkId);

    const contractSource = fs.readFileSync('./ChatContract.sol', 'utf8');

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
          runs: 200,
        },
        evmVersion: "istanbul",
        outputSelection: {
          '*': {
            '*': ['*'],
          },
        },
      },
    };

    console.log('Compiling contract...');
    const compiled = JSON.parse(solc.compile(JSON.stringify(input)));

    if (compiled.errors) {
      compiled.errors.forEach(error => {
        console.error('Compilation error:', error.formattedMessage);
      });
      if (compiled.errors.some(e => e.severity === 'error')) {
        throw new Error('Compilation failed');
      }
    }

    const contract = compiled.contracts['ChatContract.sol']['ChatContract'];
    if (!contract) throw new Error('Contract not found in compilation output');

    const accounts = await web3.eth.getAccounts();
    const gasPrice = await web3.eth.getGasPrice();
    console.log('Using account:', accounts[0]);
    console.log('Gas price:', gasPrice);

    const contractInstance = new web3.eth.Contract(contract.abi);
    const deployTx = contractInstance.deploy({
      data: '0x' + contract.evm.bytecode.object,
    });

    const gasEstimate = await deployTx.estimateGas({ from: accounts[0] });
    console.log('Estimated gas:', gasEstimate);

    const deployed = await deployTx.send({
      from: accounts[0],
      gas: Number(gasEstimate) + Math.ceil(Number(gasEstimate) * 0.2),
      gasPrice: Number(gasPrice),
    });

    console.log('ChatContract deployed to:', deployed.options.address);

    fs.writeFileSync('./contract-info.json', JSON.stringify({
      address: deployed.options.address,
      abi: contract.abi
    }, null, 2));

    console.log('Contract info saved to contract-info.json');
    return deployed;
  } catch (err) {
    console.error('Deployment failed:', err);
    process.exit(1);
  }
}

deployChatContract();
