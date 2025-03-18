import { Web3Auth } from "@web3auth/modal";
import { CHAIN_NAMESPACES, WEB3AUTH_NETWORK } from "@web3auth/base";
import { OpenloginAdapter } from "@web3auth/openlogin-adapter";
import { TorusWalletAdapter } from "@web3auth/torus-evm-adapter";
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";
import { createWalletClient, custom, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Declare the global window interface
declare global {
  interface Window {
    web3AuthInstance?: Web3Auth;
  }
}

// MetaDog contract ABI (simplified for mint functions)
const CONTRACT_ABI = [
  {
    "inputs": [{ "internalType": "uint256", "name": "count", "type": "uint256" }],
    "name": "publicMint",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "count", "type": "uint256" },
      { "internalType": "uint256", "name": "allowance", "type": "uint256" },
      { "internalType": "bytes32[]", "name": "proof", "type": "bytes32[]" }
    ],
    "name": "whitelistMint",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalSupply",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
];

// Contract address from deployment output
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";

// Chain ID (from the deployment logs or environment variable)
const CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || "49176");

// Web3Auth Configuration
export const initWeb3Auth = async () => {
  try {
    console.log("Initializing Web3Auth...");
    console.log("Client ID:", process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID);
    
    // Configure chain
    const chainConfig = {
      chainNamespace: CHAIN_NAMESPACES.EIP155,
      chainId: `0x${CHAIN_ID.toString(16)}`, // Convert to hex string
      rpcTarget: process.env.NEXT_PUBLIC_RPC_URL || "https://node-01-be1a1.gke-japan.settlemint.com/sm_aat_570ed8f08fdd3064",
      displayName: "Settlemint BTP",
      blockExplorerUrl: "",
      ticker: "ETH",
      tickerName: "Ethereum",
    };

    console.log("Chain Config:", chainConfig);

    // Create the private key provider (required in Web3Auth v9.7.0+)
    const privateKeyProvider = new EthereumPrivateKeyProvider({
      config: { chainConfig }
    });

    // Initialize Web3Auth with the provider
    const web3auth = new Web3Auth({
      clientId: process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID || "", 
      web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET, // Change to DEVNET instead of MAINNET
      privateKeyProvider
    });

    console.log("Web3Auth instance created");

    // Store the web3auth instance globally
    if (typeof window !== 'undefined') {
      window.web3AuthInstance = web3auth;
    }

    // Configure OpenLogin Adapter for social logins
    const openloginAdapter = new OpenloginAdapter({
      adapterSettings: {
        clientId: process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID || "",  // Add clientId here explicitly
        network: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET, // Match the network with Web3Auth main config
        uxMode: "popup",
        whiteLabel: {
          logoLight: "https://web3auth.io/images/w3a-L-Favicon-1.svg",
          logoDark: "https://web3auth.io/images/w3a-D-Favicon-1.svg",
          defaultLanguage: "en",
          // @ts-ignore - dark theme is supported but missing in type
          dark: true, 
        },
      },
    });
    
    // @ts-ignore - adapter compatibility issue in types
    web3auth.configureAdapter(openloginAdapter);
    
    // Add Torus Wallet adapter for more wallet options
    const torusWalletAdapter = new TorusWalletAdapter({
      clientId: process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID || "",
      // Network is configured at the Web3Auth instance level
    });
    // @ts-ignore - adapter compatibility issue in types
    web3auth.configureAdapter(torusWalletAdapter);

    console.log("Calling web3auth.initModal()...");
    await web3auth.initModal();
    console.log("Web3Auth modal initialized successfully");
    
    return web3auth;
  } catch (error) {
    console.error("Error initializing Web3Auth:", error);
    // Extract more detailed error information
    if (error instanceof Error) {
      console.error("Error name:", error.name);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
    
    // Add more debugging details
    console.error("Client ID used:", process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID);
    console.error("Chain ID used:", CHAIN_ID);
    console.error("RPC URL used:", process.env.NEXT_PUBLIC_RPC_URL);
    console.error("Web3Auth Network:", WEB3AUTH_NETWORK.SAPPHIRE_DEVNET);
    
    throw error;
  }
};

// Get User Info
export const getUserInfo = async (web3auth: Web3Auth) => {
  if (!web3auth) return null;
  return await web3auth.getUserInfo();
};

// Create a provider to interact with the blockchain
export const getProvider = async (web3auth: Web3Auth) => {
  if (!web3auth) return null;
  
  const provider = await web3auth.provider;
  if (!provider) return null;
  
  return provider;
};

// Get the user's wallet address
export const getAddress = async (web3auth: Web3Auth) => {
  if (!web3auth) return null;
  
  const provider = await getProvider(web3auth);
  if (!provider) return null;
  
  // Request accounts using the provider directly
  const accounts = await provider.request({ method: 'eth_accounts' }) as string[];
  return accounts[0];
};

// Call the mint function on the contract
export const mintNFT = async (web3auth: Web3Auth, count: number = 1, useWhitelistMint: boolean = false) => {
  if (!web3auth) throw new Error("Web3Auth not initialized");
  
  const provider = await getProvider(web3auth);
  if (!provider) throw new Error("Provider not available");
  
  try {
    const privateKey = await web3auth.provider?.request({
      method: "eth_private_key",
    }) as string;
    
    if (!privateKey) throw new Error("Could not get private key");
    
    const account = privateKeyToAccount(`0x${privateKey}`);
    
    // @ts-ignore - typing issue with custom transport in current version
    const client = createWalletClient({
      account,
      transport: custom(provider),
      chain: undefined, // No specific chain needed as we're using the provider's network
    });
    
    // Use the exact prices from the contract
    const PRICE_PER_NFT_WHITELIST = parseEther("0");
    const PRICE_PER_NFT_PUBLIC = parseEther("0");
    
    // Calculate total price based on count and mint type
    const value = useWhitelistMint 
      ? PRICE_PER_NFT_WHITELIST * BigInt(count)
      : PRICE_PER_NFT_PUBLIC * BigInt(count);
    
    console.log(`Minting ${count} NFT(s) with value: ${value} wei (${useWhitelistMint ? 'whitelist' : 'public'} mint)`);
    
    try {
      let txHash;
      
      if (useWhitelistMint) {
        // For whitelist mint, you would need to provide proof and allowance
        // This is a simplified example - in a real app, you'd fetch these from your backend
        const allowance = BigInt(5);
        const proof: `0x${string}`[] = [];
        
        // @ts-ignore - Type issues with the contract ABI and args
        txHash = await client.writeContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          abi: CONTRACT_ABI,
          functionName: "whitelistMint",
          args: [BigInt(count), allowance, proof],
          value,
          chain: undefined,
        });
      } else {
        // Public mint
        // @ts-ignore - Type issues with the contract ABI and args
        txHash = await client.writeContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          abi: CONTRACT_ABI,
          functionName: "publicMint",
          args: [BigInt(count)],
          value,
          chain: undefined,
        });
      }
      
      return { 
        success: true,
        txHash
      };
    } catch (error) {
      console.error("Error minting NFT:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  } catch (error) {
    console.error("Error preparing for mint:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Directly calls the collect-reserves API endpoint - bare minimum version
 */
export const collectReservesDirect = async () => {
  // Get contract address from env or use default
  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || CONTRACT_ADDRESS;
  
  // Just make the direct API call with fixed admin address
  return fetch(`https://scp-2d349.gke-japan.settlemint.com/api/erc-721/${contractAddress}/collect-reserves`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: '0x665Fe3B8e7fe16fcE541D7122Ea3963bC3EE40c4', // Fixed admin address
      gasLimit: '',
      gasPrice: '',
      simulate: false,
      metadata: {}
    })
  })
  .then(response => response.json())
  .then(data => {
    console.log('Collect reserves result:', data);
    return data;
  })
  .catch(error => {
    console.error('Error collecting reserves:', error);
    throw error;
  });
};

// Disconnect web3auth
export const disconnect = async (web3auth: Web3Auth) => {
  if (web3auth) {
    await web3auth.logout();
  }
};

// Get the total supply from the contract
export const getTotalSupply = async (web3auth: Web3Auth) => {
  if (!web3auth) throw new Error("Web3Auth not initialized");
  
  const provider = await getProvider(web3auth);
  if (!provider) throw new Error("Provider not available");
  
  try {
    // Call the totalSupply function on the contract
    const result = await provider.request({
      method: 'eth_call',
      params: [
        {
          to: CONTRACT_ADDRESS,
          data: '0x18160ddd' // Function selector for totalSupply()
        },
        'latest'
      ]
    });
    
    // Convert the hex result to a number
    const totalSupply = parseInt(result as string, 16);
    console.log(`Current total supply from contract: ${totalSupply}`);
    return totalSupply;
  } catch (error) {
    console.error("Error getting total supply:", error);
    return null;
  }
};

// Get the total supply directly from the RPC URL (for server components)
export const fetchTotalSupplyFromRPC = async () => {
  try {
    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "https://node-01-be1a1.gke-japan.settlemint.com/sm_aat_570ed8f08fdd3064";
    
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: new Date().getTime(),
        method: 'eth_call',
        params: [
          {
            to: CONTRACT_ADDRESS,
            data: '0x18160ddd' // Function selector for totalSupply()
          },
          'latest'
        ]
      })
    });
    
    const data = await response.json();
    
    if (data.error) {
      console.error("RPC error:", data.error);
      return null;
    }
    
    // Convert the hex result to a number
    const totalSupply = parseInt(data.result, 16);
    console.log(`Current total supply from RPC: ${totalSupply}`);
    return totalSupply;
  } catch (error) {
    console.error("Error fetching total supply from RPC:", error);
    return null;
  }
}; 