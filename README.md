# nali
a DI service registry

note, this is a work in progress and the API should be considered unstable

## usage
```js
const nali = require('nali')

// register some static instances - config, etc

nali.registerInstance('config', {conn_str: 'http://foo.bar'})

// we can get those back synchronously using nali(name)

const config = nali('config')
// => {conn_str: 'http://foo.bar'}

// we can register services
// type Service: (...) => Instance
// Services are functions with
// optional dependency names as parameters
// and which return an initialized instance of itself
// the return value can be a Promise or a Value
nali.registerService('db', {
  function (config) {
    return Doodaboos.connect(config.conn_str)
  })

// we can resolve an instance of our `db` service:

nali.resolve('db').then(function (db) {
  // now we can do stuff with our db service
})

```

nali will fetch or lazily instantiate arbitrary trees of service dependencies.

## api

### `nali(name: String) => service:any`
(alias: `nali.fetch`)

Synchronously fetch a service instance

### `nali.resolve(name: String) => Promise<service: Any>`
Asynchronously resolve an instance of a service, lazily instantiating any dependencies if necessary

### `nali.registerInstance(name: String, instance: Object) => void`

### `nali.registerService(name: String, service: Service) => void`


## Service Dependencies

DI works similar to Angular. Service init functions state the names of their dependencies as parameter names, which are parsed out when the Service is registered. They are not called with `new` or with any particular `this` context.

Return a Promises/A+ promise if you need to asynchronously instantiate a service

## not implemented

- scopes
- disposing instances / lifecycle management
- anything else


## installation

    $ npm install nali


## running the tests

From package root:

    $ npm install
    $ npm test


## contributors

- jden <jason@denizac.org>


## license

MIT. (c) MMXIII AgileMD. See LICENSE.md
