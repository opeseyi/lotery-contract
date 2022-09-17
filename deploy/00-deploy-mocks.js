const { network, ethers, getNamedAccounts, deployments } = require('hardhat');
const { developmentChains } = require('../helper-hardhat-config');

const BASE_FEE = ethers.utils.parseEther('0.25'); // 0.25 is the premium. it costs 0.25Link
const GAS_PRICE_LINK = 1e9; //link per gas. Calculated valuse based on the gas price of the chain

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const arg = [BASE_FEE, GAS_PRICE_LINK];

  if (developmentChains.includes(network.name)) {
    log('Local network detected: Deploying mocks');
    // deploying a mock contract
    await deploy('VRFCoordinatorV2Mock', {
      from: deployer,
      args: arg,
      log: true,
      waitConfirmation: network.config.blockConfirmations || 1,
    });
    log('Mocks deployed');
    log('----------------------------------------------------------');
  }
};

module.exports.tags = ['all', 'mocks'];
