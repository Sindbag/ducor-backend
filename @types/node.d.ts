declare namespace NodeJS {
  export interface ProcessEnv {
    DUCOR_EOS_WATCH_DELAY: string
    DUCOR_EOS_CHAINID: string
    DUCOR_EOS_ENDPOINT: string
    DUCOR_EOS_MASTER_ORACLE: string
    DUCOR_EOS_RETHINKHOST: string
    DUCOR_EOS_RETHINKPORT: string
    DUCOR_EOS_RETHINKDATABASE: string
    DUCOR_EOS_RETHINKTABLE: string

    DUCOR_ETH_PROVIDER: string
    DUCOR_ETH_MASTER_ADDRESS: string
    DUCOR_ETH_ORACLE_PRIVATEKEY: string
    DUCOR_ETH_ORACLE_ACCOUNT: string
  }
}
