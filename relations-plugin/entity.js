const {
  defineProperties, defineIndex,
  processModelsAnnotation, extractIdParts, extractIdentifiers, extractObjectData
} = require('./utils.js')
const App = require("@live-change/framework")

const annotation = 'entity'

function defineView(config, context) {
  const { service, modelRuntime, modelName, others, model } = context
  const viewName = (config.prefix || '' ) + modelName + (config.suffix || '')
  service.views[viewName] = new ViewDefinition({
    name: viewName,
    properties: {
      [modelName]: {
        type: model,
        validation: ['nonEmpty']
      }
    },
    returns: {
      type: model,
    },
    access: config.access,
    daoPath(properties, { client, context }) {
      const id = properties[modelName]
      const path = config.fields ? modelRuntime().limitedPath(id, config.fields) : modelRuntime().path(id)
      return path
    }
  })
}

function defineCreatedEvent(config, context) {
  const {
    service, modelRuntime, modelName, modelPropertyName
  } = context
  const eventName = modelName + 'Created'
  service.events[eventName] = new EventDefinition({
    name: eventName,
    execute(properties) {
      const id = properties[modelPropertyName]
      return modelRuntime().create({ ...properties.data, id })
    }
  })
}

function defineUpdatedEvent(config, context) {
  const {
    service, modelRuntime, modelName, modelPropertyName
  } = context
  const eventName = modelName + 'Updated'
  service.events[eventName] = new EventDefinition({
    name: eventName,
    execute(properties) {
      const id = properties[modelPropertyName]
      return modelRuntime().update(id, { ...properties.data, id })
    }
  })
}

function defineDeletedEvent(config, context) {
  const {
    service, modelRuntime, modelName, modelPropertyName,
  } = context
  const eventName = modelName + 'Deleted'
  service.events[eventName] = new EventDefinition({
    name: eventName,
    execute(properties) {
      const id = properties[modelPropertyName]
      return modelRuntime().delete(id)
    }
  })
}


function defineCreateAction(config, context) {
  const {
    service, app, model,  defaults, modelPropertyName, modelRuntime,
    modelName, writeableProperties
  } = context
  const eventName = modelName + 'Created'
  const actionName = 'create' + modelName
  service.actions[actionName] = new ActionDefinition({
    name: actionName,
    properties: {
      ...(model.properties)
    },
    access: config.createAccess || config.writeAccess,
    skipValidation: true,
    //queuedBy: otherPropertyNames,
    waitForEvents: true,
    async execute(properties, { client, service }, emit) {
      const id = properties[modelPropertyName] || app.generateUid()
      const entity = await modelRuntime().get(id)
      if(entity) throw 'exists'
      const data = extractObjectData(writeableProperties, properties, defaults)
      await App.validation.validate({ ...data }, validators,
        { source: action, action, service, app, client })
      emit({
        type: eventName,
        [modelPropertyName]: id,
        data
      })
    }
  })
  const action = service.actions[actionName]
  const validators = App.validation.getValidators(action, service, action)
}

function defineUpdateAction(config, context) {
  const {
    service, app, model, modelRuntime, modelPropertyName,
    modelName, writeableProperties
  } = context
  const eventName = modelName + 'Updated'
  const actionName = 'update' + modelName
  service.actions[actionName] = new ActionDefinition({
    name: actionName,
    properties: {
      ...(model.properties)
    },
    access: config.updateAccess || config.writeAccess,
    skipValidation: true,
    //queuedBy: otherPropertyNames,
    waitForEvents: true,
    async execute(properties, { client, service }, emit) {
      const id = properties[modelPropertyName]
      const entity = await modelRuntime().get(id)
      if(!entity) throw 'not_found'
      const data = extractObjectData(writeableProperties, properties, entity)
      await App.validation.validate({ ...identifiers, ...data }, validators,
        { source: action, action, service, app, client })
      emit({
        type: eventName,
        [modelPropertyName]: id,
        data
      })
    }
  })
  const action = service.actions[actionName]
  const validators = App.validation.getValidators(action, service, action)
}

function defineDeleteAction(config, context) {
  const {
    service, app, model, modelRuntime, modelPropertyName,
    otherPropertyNames, modelName,
  } = context
  const eventName = modelName + 'Deleted'
  const actionName = 'delete' + modelName
  service.actions[actionName] = new ActionDefinition({
    name: actionName,
    properties: {
      ...(model.properties)
    },
    access: config.deleteAccess || config.writeAccess,
    skipValidation: true,
    waitForEvents: true,
    async execute(properties, { client, service }, emit) {
      const id = properties[modelPropertyName]
      const entity = await modelRuntime().get(id)
      if(!entity) throw new Error('not_found')
      emit({
        type: eventName,
        [modelPropertyName]: id
      })
    }
  })
}

module.exports = function(service, app) {
  if (!service) throw new Error("no service")
  if (!app) throw new Error("no app")

  for(let modelName in service.models) {
    const model = service.models[modelName]
    const config = model[annotation]
    if(!config) continue

    if (model[annotation + 'Processed']) throw new Error("duplicated processing of " + annotation + " processor")
    model[annotation + 'Processed'] = true

    const originalModelProperties = { ...model.properties }
    const modelProperties = Object.keys(model.properties)
    const modelPropertyName = modelName.slice(0, 1).toLowerCase() + modelName.slice(1)
    const defaults = App.utils.generateDefault(originalModelProperties)

    function modelRuntime() {
      return service._runtime.models[modelName]
    }

    if (!model.indexes) {
      model.indexes = {}
    }

    const writeableProperties = modelProperties || config.writeableProperties
    //console.log("PPP", others)
    const otherPropertyNames = others.map(other => other.slice(0, 1).toLowerCase() + other.slice(1))

    const context = {
      service, app, model, originalModelProperties, modelProperties, modelPropertyName, defaults, modelRuntime,
      otherPropertyNames, modelName, writeableProperties, annotation
    }

    if (config.readAccess) {
      defineView(config, context)
    }
    /// TODO: multiple views with limited fields

    defineCreatedEvent(config, context)
    defineUpdatedEvent(config, context)
    defineDeletedEvent(config, context)

    if (config.createAccess || config.writeAccess) {
      defineCreateAction(config, context)
    }

    if (config.updateAccess || config.writeAccess) {
      defineUpdateAction(config, context)
    }

    if (config.deleteAccess || config.writeAccess) {
      defineDeleteAction(config, context)
    }

  }
}