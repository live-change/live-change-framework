const cookie = require("cookie")
const Dao = require("@live-change/dao")
const { connection } = require("websocket")
const Services = require('../lib/Services.js')
const app = require("@live-change/framework").app()


async function setupApiServer(settings) {
  const { services: config, withServices, updateServices } = settings

  if(settings.createDb) {
    const list = await app.dao.get(['database', 'databasesList'])
    console.log("existing databases:", list.join(', '))
    console.log("creating database", app.databaseName)
    await app.dao.request(['database', 'createDatabase'], app.databaseName, {
      storage: { noMetaSync: true, noSync: true }
    }).catch(err => 'exists')
  }

  const services = new Services(config)

  await services.loadServices()
  if(updateServices) await services.update()
  await services.start(withServices
      ? { runCommands: true, handleEvents: true, indexSearch: true }
      : { runCommands: false, handleEvents: false, indexSearch: false })

  if(settings.initScript) {
    const initScript = await import(await services.resolve(settings.initScript))
    await (initScript.default || initScript)(services.getServicesObject())
  }

  const apiServerConfig = {
    services: services.services,
    //local, remote, <-- everything from services
    local(credentials) {
      const local = {
        version: new Dao.SimpleDao({
          values: {
            version: {
              observable() {
                return new Dao.ObservableValue(settings.version || process.env.VERSION)
              },
              async get() {
                return settings.version || process.env.VERSION
              }
            }
          }
        })
      }
      if(settings.dbAccess) {
        local.serverDatabase = {
          observable(what) {
            return app.dao.observable(['database', ...what.slice(1)])
          },
          get(what) {
            return app.dao.get(['database', ...what.slice(1)])
          },
          request(what, ...args) {
            return app.dao.request(['database', ...what.slice(1)], ...args)
          }
        }
      }
      return local
    },
    shareDefinition: true,
    logErrors: true,
    createSessionOnUpdate: true, /// deprecated - moved to session-service settings
    fastAuth: settings.fastAuth /* && ((connection) => {
      const cookies = cookie.parse(connection.headers.cookie || '')
      return {
        sesionId: cookies.sessionId,
        sessionKey: cookies.sessionKey
      }
    }) */
  }

  const apiServer = await app.createLiveApiServer(apiServerConfig)

  apiServer.services = services

  return apiServer
}

module.exports = setupApiServer
