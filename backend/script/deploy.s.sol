// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {PropertyNFTMarketplace} from "../src/realestate.sol";

contract DeployScript is Script {
    function run() external {
        vm.startBroadcast();

        address priceFeedAddress;
        
        // Get the current chain ID to determine the correct price feed address
        uint256 chainId = block.chainid;
        
        if (chainId == 11155111) {
            // Sepolia Testnet ETH/USD
            priceFeedAddress = 0x694AA1769357215DE4FAC081bf1f309aDC325306;
            console.log("Deploying on Sepolia Testnet");
        } else if (chainId == 1) {
            // Ethereum Mainnet ETH/USD
            priceFeedAddress = 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419;
            console.log("Deploying on Ethereum Mainnet");
        } else if (chainId == 5) {
            // Goerli Testnet ETH/USD (if still supported)
            priceFeedAddress = 0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e;
            console.log("Deploying on Goerli Testnet");
        } else {
            // Default to Sepolia for unknown networks
            priceFeedAddress = 0x694AA1769357215DE4FAC081bf1f309aDC325306;
            console.log("Unknown network, defaulting to Sepolia price feed");
        }

        PropertyNFTMarketplace marketplace = new PropertyNFTMarketplace(priceFeedAddress);

        console.log("PropertyNFTMarketplace deployed at:", address(marketplace));
        console.log("Using price feed address:", priceFeedAddress);

        vm.stopBroadcast();
    }
}
