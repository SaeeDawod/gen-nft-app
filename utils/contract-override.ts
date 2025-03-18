// // This file provides a modified ABI for the contract on zero-fee networks
// // It overrides the standard ABI to bypass the payment check

// // Original Contract ABI (simplified for mint functions)
// export const ORIGINAL_CONTRACT_ABI = [
//   {
//     "inputs": [{ "internalType": "uint256", "name": "count", "type": "uint256" }],
//     "name": "publicMint",
//     "outputs": [],
//     "stateMutability": "payable",
//     "type": "function"
//   },
//   {
//     "inputs": [
//       { "internalType": "uint256", "name": "count", "type": "uint256" },
//       { "internalType": "uint256", "name": "allowance", "type": "uint256" },
//       { "internalType": "bytes32[]", "name": "proof", "type": "bytes32[]" }
//     ],
//     "name": "whitelistMint",
//     "outputs": [],
//     "stateMutability": "payable",
//     "type": "function"
//   }
// ];

// // Test network ABI overrides
// // This is used on zero-fee networks to bypass the payment check
// export const ZERO_FEE_CONTRACT_ABI = [
//   {
//     "inputs": [{ "internalType": "uint256", "name": "count", "type": "uint256" }],
//     "name": "publicMint",
//     "outputs": [],
//     "stateMutability": "nonpayable", // Changed to nonpayable to avoid value check
//     "type": "function"
//   },
//   {
//     "inputs": [
//       { "internalType": "uint256", "name": "count", "type": "uint256" },
//       { "internalType": "uint256", "name": "allowance", "type": "uint256" },
//       { "internalType": "bytes32[]", "name": "proof", "type": "bytes32[]" }
//     ],
//     "name": "whitelistMint",
//     "outputs": [],
//     "stateMutability": "nonpayable", // Changed to nonpayable to avoid value check
//     "type": "function"
//   }
// ];

// // Function to get the appropriate ABI based on network
// export const getContractABI = (isZeroFeeNetwork: boolean = false) => {
//   return isZeroFeeNetwork ? ZERO_FEE_CONTRACT_ABI : ORIGINAL_CONTRACT_ABI;
// }; 