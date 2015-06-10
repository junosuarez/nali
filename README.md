# nali
a service registry for dependency injection and application composition


[![js-standard-style](https://cdn.rawgit.com/feross/standard/master/badge.svg)](https://github.com/feross/standard)
[![Dependency Status](https://david-dm.org/jden/nali.svg)](https://david-dm.org/jden/nali) 
[![Circle CI](https://circleci.com/gh/jden/nali.svg?style=svg)](https://circleci.com/gh/jden/nali)

## usage
```js
const nali = require('nali')

// we can register services
// type Service: (...) => Instance
// Services are functions with
// optional dependency names as parameters
// and which return an initialized instance of itself
// the return value can be a Promise or a Value
nali.register({
  config: function () {
    return P
    conn_str: 'http://foo.bar'
  },
  db: function (config) {
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

Can also be used to asynchronously resolve multiple dependencies, for example:

```js
nali(function (db, log, sessions, webService) {
  // now we have all the things
})
```

### `nali.resolve(name: String) => Promise<service: Any>`
Asynchronously resolve an instance of a service, lazily instantiating any dependencies if necessary

### `nali.registerInstance(name: String, instance: Object) => void`

*deprecated* use `nali.register('name', () => instance)` instead


### `nali.registerService(name: String, service: Service) => void`
*deprecated* use `nali.register('name', service)` instead

## Service Dependencies

DI works similar to Angular. Service init functions state the names of their dependencies as parameter names, which are parsed out when the Service is registered. They are not called with `new` or with any particular `this` context.

Return a Promises/A+ promise if you need to asynchronously instantiate a service

## Resolution algorithm

Work in progress.

Try get local instance
Try get new instance of local service
Try get parent instance
Try get new instance of parent service
Etc

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

MIT. (c) MMXV AgileMD. See LICENSE.md
