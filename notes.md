type Container : {
  services: Array<Service>,
  blocks: Array<Block>,
  _instances: Array,

  registerService : Function,
  registerInstance : Function,
  resolve: Function,
} & EventEmitter

type Service : {
  name: String,
  dependsOn: Array<serviceName: String>,
  container: Container,
  block: Block
}

type Block : {
  name: String,
  container: Container,
  dependsOn: Array<containerName: String>
}