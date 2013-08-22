type Container : {
  services: Array<Service>,
  blocks: Array<Block>,
  
  _instances: Array,
  _state: Object,
  _opts: Object,

  parentContainer: Container?,
  childContainers: Array<Container>

  registerService : Function,
  registerInstance : Function,
  resolve: Function,
} & EventEmitter

type Service : {
  name: String,
  dependsOn: Array<serviceName: String>,
  constructor: Function : null
  container: Container,
  block: Block,

  getInstance : Function
}

type Block : {
  name: String,
  dependsOn: Array<containerName: String>,
  services: Array<Service>,
  container: Container
}