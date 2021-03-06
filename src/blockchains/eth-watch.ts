import Web3 from "web3"
import { IBlockchainReader } from "../IBlockchain"
import master from "./MasterOracle.json"
import r from "rethinkdb"

export interface IEthereumWatcherOptions {
  web3provider: string
  masterAddress: string

  rethinkHost: string
  rethinkPort: number
  rethinkDB: string
  rethinkTable: string
}

function assertEnv() {
  console.assert(
    process.env.DUCOR_ETH_PROVIDER,
    "DUCOR_ETH_PROVIDER is required"
  )
  console.assert(
    process.env.DUCOR_EOS_RETHINKHOST,
    "DUCOR_EOS_RETHINKHOST not found in .env!"
  )
  console.assert(
    process.env.DUCOR_EOS_RETHINKPORT,
    "DUCOR_EOS_RETHINKPORT not found in .env!"
  )
  console.assert(
    process.env.DUCOR_EOS_RETHINKDATABASE,
    "DUCOR_EOS_RETHINKDATABASE not found in .env!"
  )
  console.assert(
    process.env.DUCOR_EOS_RETHINKTABLE,
    "DUCOR_EOS_RETHINKTABLE not found in .env!"
  )
}

function getOptions(): IEthereumWatcherOptions {
  assertEnv()
  return {
    web3provider: process.env.DUCOR_ETH_PROVIDER!,
    masterAddress: process.env.DUCOR_ETH_MASTER_ADDRESS!,

    rethinkHost: process.env.DUCOR_EOS_RETHINKHOST!,
    rethinkPort: parseInt(process.env.DUCOR_EOS_RETHINKPORT!),
    rethinkDB: process.env.DUCOR_EOS_RETHINKDATABASE!,
    rethinkTable: process.env.DUCOR_EOS_RETHINKTABLE!
  }
}

async function getConnection(
  host: string,
  port: number
): Promise<r.Connection> {
  return r.connect({ host, port })
}
async function getOrCreateDatabase(
  database: string,
  connection: r.Connection
): Promise<r.Db> {
  const databases = await r.dbList().run(connection)
  if (databases.indexOf(database) === -1) {
    await r.dbCreate(database).run(connection)
  }

  return r.db(database)
}
async function checkOrCreateTable(
  table: string,
  db: r.Db,
  conn: r.Connection,
  opts?: r.TableOptions
) {
  const tables = await db.tableList().run(conn)
  if (tables.indexOf(table) === -1) {
    await db.tableCreate(table, opts).run(conn)
  }
}

export const start: IBlockchainReader = async listener => {
  const options = getOptions()
  const web3 = new Web3()
  const eventProvider = new Web3.providers.WebsocketProvider(
    options.web3provider
  )
  web3.setProvider(eventProvider)

  const masterContract = new web3.eth.Contract(
    master.abi,
    options.masterAddress
  )

  masterContract.events
    .allEvents({
      fromBlock: 0
    })
    .on("data", async event => {
      const conn = await getConnection(options.rethinkHost, options.rethinkPort)
      const db = await getOrCreateDatabase(options.rethinkDB, conn)
      await checkOrCreateTable(options.rethinkTable, db, conn, {
        primary_key: "id"
      })

      const model = {
        id: event.transactionHash,
        task: event.returnValues.name,
        contract: event.returnValues.receiver,
        timestamp: new Date().getTime()
      }

      await db
        .table(options.rethinkTable)
        .insert([model], {
          conflict: "replace"
        })
        .run(conn)

      await conn.close()

      listener({
        dataHash: model.task,
        requestId: model.id,
        receiver: model.contract,
        blockchain: "eth",
        timestamp: model.timestamp
      })
    })

  return {
    stop: async () => {
      console.log("stop ethereum watcher")
    }
  }
}
