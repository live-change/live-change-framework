const App = require("@live-change/framework")
const { PropertyDefinition, ViewDefinition, IndexDefinition, ActionDefinition, EventDefinition } = App

const {
  extractIdParts, extractIdentifiers, extractObjectData, defineProperties, defineIndex,
  processModelsAnnotation, generateId
} = require('./utils.js')


function defineView(config, context) {
  const { service, modelRuntime, otherPropertyNames, joinedOthersPropertyName, joinedOthersClassName,
     modelName, others, model } = context
  const viewProperties = {}
  for (let i = 0; i < others.length; i++) {
    viewProperties[otherPropertyNames[i]] = new PropertyDefinition({
      type: others[i],
      validation: ['nonEmpty']
    })
  }
  const viewName = config.name || ((config.prefix ? (config.prefix + joinedOthersClassName) : joinedOthersPropertyName) +
    'Owned' + modelName + (config.suffix || ''))
  service.views[viewName] = new ViewDefinition({
    name: viewName,
    properties: {
      ...viewProperties
    },
    returns: {
      type: model,
    },
    access: config.access,
    daoPath(properties, { client, context }) {
      const idParts = extractIdParts(otherPropertyNames, properties)
      const id = idParts.length > 1 ? idParts.map(p => JSON.stringify(p)).join(':') : idParts[0]
      const path = config.fields ? modelRuntime().limitedPath(id, config.fields) : modelRuntime().path(id)
      return path
    }
  })
}

const  { defineSetEvent, defineUpdatedEvent, defineTransferredEvent, defineResetEvent } = require('./propertyEvents.js')

function defineSetAction(config, context) {
  const {
    service, app, model,  defaults,
    otherPropertyNames, joinedOthersPropertyName, modelName, writeableProperties, joinedOthersClassName
  } = context
  const eventName = joinedOthersPropertyName + 'Owned' + modelName + 'Set'
  const actionName = 'set' + joinedOthersClassName + 'Owned' + modelName
  service.actions[actionName] = new ActionDefinition({
    name: actionName,
    properties: {
      ...(model.properties)
    },
    access: config.setAccess || config.writeAccess,
    skipValidation: true,
    queuedBy: otherPropertyNames,
    waitForEvents: true,
    async execute(properties, {client, service}, emit) {
      const identifiers = extractIdentifiers(otherPropertyNames, properties)
      const data = extractObjectData(writeableProperties, properties, defaults)
      await App.validation.validate(data, validators, { source: action, action, service, app, client })
      emit({
        type: eventName,
        identifiers, data
      })
    }
  })
  const action = service.actions[actionName]
  const validators = App.validation.getValidators(action, service, action)
}

function defineUpdateAction(config, context) {
  const {
    service, app, model, modelRuntime,
    otherPropertyNames, joinedOthersPropertyName, modelName, writeableProperties, joinedOthersClassName
  } = context
  const eventName = joinedOthersPropertyName + 'Owned' + modelName + 'Updated'
  const actionName = 'update' + joinedOthersClassName + 'Owned' + modelName
  service.actions[actionName] = new ActionDefinition({
    name: actionName,
    properties: {
      ...(model.properties)
    },
    access: config.updateAccess || config.writeAccess,
    skipValidation: true,
    queuedBy: otherPropertyNames,
    waitForEvents: true,
    async execute(properties, {client, service}, emit) {
      const identifiers = extractIdentifiers(otherPropertyNames, properties)
      const id = generateId(otherPropertyNames, properties)
      const entity = await modelRuntime().get(id)
      if (!entity) throw new Error('not_found')
      const data = extractObjectData(writeableProperties, properties, entity)
      await App.validation.validate(data, validators, { source: action, action, service, app, client })
      emit({
        type: eventName,
        identifiers, data
      })
    }
  })
  const action = service.actions[actionName]
  const validators = App.validation.getValidators(action, service, action)
}

function defineResetAction(config, context) {
  const {
    service, modelRuntime, modelPropertyName,
    otherPropertyNames, joinedOthersPropertyName, modelName, joinedOthersClassName, model
  } = context
  const eventName = joinedOthersPropertyName + 'Owned' + modelName + 'Reset'
  const actionName = 'reset' + joinedOthersClassName + 'Owned' + modelName
  service.actions[actionName] = new ActionDefinition({
    name: actionName,
    properties: {
      [modelPropertyName]: {
        type: model,
        validation: ['nonEmpty']
      }
    },
    access: config.resetAccess || config.writeAccess,
    queuedBy: otherPropertyNames,
    waitForEvents: true,
    async execute(properties, {client, service}, emit) {
      const identifiers = extractIdentifiers(otherPropertyNames, properties)
      const id = generateId(otherPropertyNames, properties)
      const entity = await modelRuntime().get(id)
      if (!entity) throw new Error('not_found')
      emit({
        type: eventName,
        identifiers
      })
    }
  })
}



module.exports = function(service, app) {
  processModelsAnnotation(service, app, 'propertyOf', (config, context) => {

    defineProperties(context.model, context.others, context.otherPropertyNames)
    defineIndex(context.model, context.joinedOthersClassName, context.otherPropertyNames)

    if(config.readAccess) {
      defineView({ ...config, access: config.readAccess }, context)
    }
    if(config.views) {
      for(const view of config.views) {
        defineView({ ...config, ...view }, context)
      }
    }

    defineSetEvent(config, context, generateId)
    defineUpdatedEvent(config, context, generateId)
    defineTransferredEvent(config, context, generateId)
    defineResetEvent(config, context, generateId)

    if(config.setAccess || config.writeAccess) {
      defineSetAction(config, context)
    }

    if(config.updateAccess || config.writeAccess) {
      defineUpdateAction(config, context)
    }

    if(config.resetAccess || config.writeAccess) {
      defineResetAction(config, context);
    }
  })
}