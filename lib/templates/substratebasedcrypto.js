const AbstractCryptoModule = require('./abstractcryptomodule')
const { ApiPromise, WsProvider } = require('@polkadot/api');
const { Keyring, decodeAddress, encodeAddress, createPair } = require('@polkadot/keyring');
const { randomBytes } = require('crypto');
fetch = require("node-fetch");
/**
* An Implementation of AbstractCryptoModule that supports any substrate-based module
* @extends AbstractCryptoModule
* @example
* class Polkadot extends SubstrateBasedCrypto {
*   constructor(app) {
*     super(app, 'DOT', saitoEndpoint, "Polkadot's Existential Deposit is 1 DOT, be sure not to send less than 1 DOT or leave less than 1 DOT in your wallet.");
*     this.name = 'Polkadot';
*     this.description = 'Polkadot application layer for in-browser Polkadot applications. Install this module to make Polkadot your default in-browser cryptocurrency';
*     this.categories = "Cryptocurrency";
*   }
* ...
*/
class SubstrateBasedCrypto extends AbstractCryptoModule {

  /**
   * Construct SubstrateBasedCrypto
   * @param {Object} app - Saito Application Context
   * @param {String} ticker - Ticker symbol of underlying Cryptocurrency
   * @param {String} endpoint - URI of Substrate Endpoint location
   * @param {String} info - Option info about this module
   * @example 
   * super(app, "DOT", localhost:3838, 'DOT mainnet')
   */
  constructor(app, ticker, endpoint, info = '') {
    super(app, ticker);
    this.endpoint = endpoint;
    //this.subscanEndpoint = "https://westend.api.subscan.io/";
    this.subscanEndpoint = "https://saito.io:9931/subscanapi";
    //this.subscanEndpoint = "http://kaolinite/subscanapi";
    this.info = info;
    this.optionsStorage = {};
    this._api = null; // treat as private, please use getApi to access
    this.mods = [];
    this.keypair = null;
    this.keyring = null;
  }
 /**
  * installModule runs when a node initialized a module for the first time
  * @param {Object} app - Saito Application Context
  */
  
  installModule(app) {
    // disable for now
    //app.wallet.setPreferredCrypto(this.ticker);
  }
 /**
  * Initialize Endpoint API connection and keyring
  * @param {Object} app - Saito Application Context
  */
  initialize(app) {
    if (app.BROWSER) {
      super.initialize(app);
      this.load();
      const wsProvider = new WsProvider(this.endpoint);
      this._api = new ApiPromise({ provider: wsProvider });
      this._api.on('connected', (stream) => {
        //console.log(this.description + ' Polkadot Socket Provider connected');
      });
      this._api.on('disconnected', (stream) => {
        //console.log(this.description + ' Polkadot Socket Provider disconnected');
      });
      this._api.on('ready', (stream) => {
        //console.log(this.description + ' Polkadot Socket Provider ready');
      });
      this._api.on('error', (stream) => {
        //console.log(this.description + ' Polkadot Socket Provider error');
      });
      this.keyring = new Keyring({ type: 'ed25519'});
      this.keyring.setSS58Format(0);
      if(!this.optionsStorage.keypair) {
        let keypair = this.keyring.addFromSeed(randomBytes(32), { name: 'polkadot pair' }, 'ed25519');
        this.optionsStorage.keypair = keypair.toJson();
        this.save();
      }
      this.keypair = this.keyring.addFromJson(this.optionsStorage.keypair);  
      this.keypair.decodePkcs8();
      super.initialize(app);
    }
    
  }
 /**
  * async getter for Endpoint API
  * @param {Object} app - Saito Application Context
  */
 
  async getApi() {
    await this._api.isReady;
    return this._api;
  }
  // Token decimals:
  //
  //     Polkadot (DOT): 10
  //     Kusama (KSM): 12
  getFormatedAmount(amount) {

  }
  fromFormatedAmount(amount) {

  }
  /**
   * Forces input address into the desired format.
   * Input address can be any format, DOT, KSM, or Substrate.
   * https://polkadot.js.org/docs/api/start/create
   * @param {String} address - An address in any subtrate format. See: https://github.com/paritytech/substrate/wiki/External-Address-Format-(SS58)
   * @param {String} format - The desired output format. format ∈ {"polkadot","kusama","substrateRaw"}
   */
  getFormattedAddress(address, format = "polkadot") {
    // https://github.com/paritytech/substrate/wiki/External-Address-Format-(SS58)
    // https://wiki.polkadot.network/docs/en/learn-accounts
    //
    // Polkadot addresses always start with the number 1.
    // Kusama addresses always start with a capital letter like C, D, F, G, H, J...
    // Generic Substrate addresses start with 5.
    //
    // Give some semantics to the polkadot magic numbers
    let formats = {"polkadot": 0, "kusama": 2, "substrateRaw": 42 };
    return encodeAddress(decodeAddress(address), formats[format]);
  }
 /**
  * overrides AbstractCryptoModule returnAddress
  */
  returnAddress() {
    if (this.ticker == "KSM") {
      return this.getFormattedAddress(this.keypair.address, "kusama");
    } else if (this.ticker == "WND") {
      return this.getFormattedAddress(this.keypair.address, "substrateRaw");
    } else {
      return this.getFormattedAddress(this.keypair.address);
    }
  }
 /**
  * overrides AbstractCryptoModule returnPrivateKey
  */
  returnPrivateKey() {
    return "Please remind your module developer to implement this";
    // return this.keypair.something?
  }
 /**
  * overrides AbstractCryptoModule returnBalance
  */
  async returnBalance(){
    let api = await this.getApi();
    let balance = 0.0;
    if(api.query.system.account) {
      const { nonce, data: balanceObj } = await api.query.system.account(this.keypair.publicKey);
      balance = balanceObj.free;
    } else if(api.query.balances.freeBalance) {
      balance = api.query.balances.freeBalance(this.keypair.publicKey);
    }
    if (this.ticker == "WND") {
      return balance/1000000000000;
    } else {
      return balance;
    }
  }
 /**
  * overrides AbstractCryptoModule transfer.
  * 
  * Substrate-based coins have existential deposit (ED) to prevent dust accounts from bloating state. If an account drops below the ED, it will be reaped,
  * Polkadot's ED is 1 DOT, while Kusama's is 0.0016666 KSM.
  */
  async transfer(howMuch, to) {
    if (this.ticker == "WND") {
      howMuch = howMuch*1000000000000;
    }
    let api = await this.getApi();
    const tx = await api.tx.balances.transfer(to, howMuch);
    const hash = await tx.signAndSend(this.keypair);
    return hash;
  }
 /**
  * overrides AbstractCryptoModule hasPayment
  *
  * Only looks in the last 100 payments due to a restriction on subscan's API. This could be extended by repeating the request for past pages.
  */
  hasPayment(howMuch, from, to, timestamp) {
    return new Promise((resolve, reject) => {
      let data = {
        "row": 100,
        "page": 0,
        "address": from
      }
      fetch(this.subscanEndpoint + "/api/scan/transfers", {
          method: 'POST',
          //mode: 'cors',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': '014bc513cb936da437a7710d67f27cc7'
          },
          body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then((data) => {
          for(let i = 0; i < data.data.transfers.length; i++) {
            
            let transfer = data.data.transfers[i];
            // DEBUG
            // if(i === 0){
            //   console.log(transfer.from);
            //   console.log(from);
            //   console.log(transfer.from == from);
            // 
            //   console.log(transfer.to);
            //   console.log(to);
            //   console.log(transfer.to == to);
            // 
            //   console.log(transfer.amount);
            //   console.log(howMuch);
            //   console.log(Number.parseFloat(transfer.amount) >= howMuch);
            // 
            //   console.log(transfer.block_timestamp);
            //   console.log(timestamp);
            //   console.log(parseInt(transfer.block_timestamp));
            //   console.log(parseInt(timestamp));
            //   console.log(1000*transfer.block_timestamp > timestamp);
            //   console.log(1000*parseInt(transfer.block_timestamp) > parseInt(timestamp));
            // }
            if(transfer.from == from && transfer.to == to && Number.parseFloat(transfer.amount) >= howMuch && 1000*parseInt(transfer.block_timestamp) > parseInt(timestamp)) {
              resolve(true);
              break;
            }
          }
          resolve(false);
        })
        .catch((err) => {
          console.log("Error fetching payments from subscan");
          reject(err);
        });
    });
  }
 /**
  * save state of this module to local storage
  */
  save() {
    let moduleOptions = this.app.storage.getModuleOptionsByName(this.name);
    moduleOptions.storage = this.optionsStorage;
    this.app.storage.saveOptions();
  }
 /**
  * load state of this module from local storage
  */
  load() {
    let moduleOptions = this.app.storage.getModuleOptionsByName(this.name);
    if(moduleOptions) {
      if(!moduleOptions.storage) {
        moduleOptions.storage = {};
        this.save();
      }
      this.optionsStorage = moduleOptions.storage;
    } else {
      throw "Module Not Installed: " + this.name;
    }
  }
}
module.exports = SubstrateBasedCrypto;
