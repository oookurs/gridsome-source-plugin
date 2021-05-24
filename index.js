const { Directus } = require("@directus/sdk");
const fs = require('fs');
const axios = require('axios');


// TODO ADD CLEANUP OF UNUSED IMAGES / FILES

const imageTypes = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
]
const defaultOptions = {
  queryParams: {
    limit: -1,
    fields: '*'
  }
}

function mkDir (dir) {
  if (!fs.existsSync(dir)){
    fs.mkdirSync(dir);
  }
}
function writeStreamToDest (stream, dest) {
  const file = fs.createWriteStream(dest)

  return new Promise(function (resolve, reject) {
    stream.pipe(file)
    file.on('finish', () => {
      resolve()
    })
  })
}
async function download (url, dest, token, dir) {

  let imgName = dest;

  mkDir('./src/assets/static/.cache-directus') // for cache
  mkDir(dir) // for images

  const cacheDest = `${dir}/${dest}`
  console.log(' -- Downloading Resource: ' + imgName);

  if (!fs.existsSync(cacheDest)) {
    const stream = await axios.get(url, {
      responseType: "stream",
      headers: {
        "Authorization": token
      }
    })
    await writeStreamToDest(stream.data, cacheDest)
    console.log(' -- Resource loaded')
  } else
    console.log(' -- Resource is already loaded ')

  return cacheDest.replace('./src/assets', '~/assets');
}

class DirectusSource {

  constructor (api, options) {
    this.api = api;
    this.options = options;
    this.client = null;
    this.GSStore = null;
    this.GSCollections = {};
    this.directusNameToCollectionName = {};
    this.GSCollectionsData = {};


    api.loadSource(args => this.fetchContent(args));
  }

  async initClientDirectus () {
    this.client = new Directus(this.options.apiUrl)

    await this.connect()

    this.clientCollections = await this.client.collections.readMany()
  }
  async connect () {
    try {
      const {email, password} = this.options
      await this.client.auth.login(Object.assign({ email, password, persist: false }))
    } catch (e) {
      this.error(`Can not login to Directus, ${e}`)
    }
  }

  async fetchContent (store) {

    await this.initClientDirectus()
    this.GSStore = store

    const { apiUrl, collections } = this.options

    const GSCollections = this.GSCollections
    const GSCollectionsData = this.GSCollectionsData

    this.logInfo(`Loading data from Directus at: ${apiUrl}`)

    if(collections.length <= 0)
      this.error('No Directus collections specified!')

    this.logInfo('Create Gridsome collections')

    this.addGSCollections()

    this.logInfo('DONE')


    this.logInfo('Setting up links between collections')

    this.setGSCollectionsReference()

    this.logInfo('DONE')


    this.logInfo('Data preparation for collection')

    await this.loadGSCollectionsData()

    this.logInfo('DONE')


    this.logInfo('Setting up connections between data')

    this.updateReferenceFieldsForData()

    this.logInfo('DONE')


    this.logInfo('Adding data to the collection')

    this.addDataToGSCollections()

    this.logInfo('DONE')

    this.logSuccess("Loading done!");
    await this.client.auth.logout();
  }

  addGSCollections () {
    const { collections } = this.options
    const { addCollection } = this.GSStore

    for (const collection of collections) {
      this.GSCollections[collection.name] = addCollection({
        typeName: collection.name
      })
      this.directusNameToCollectionName[collection.directusPathName] = collection.name
    }
  }
  setGSCollectionsReference () {
    const { collections } = this.options

    for(const collection of collections) {
      const GSCollection = this.GSCollections[collection.name]

      if (collection.hasOwnProperty('refs')) {
        for (const ref of collection.refs) {
          if (!ref.hasOwnProperty('collectionName'))
            this.error('The collection refs is not configured correctly (check the refs)')

          let collectionNames = null
          if (!Array.isArray(ref.collectionName)) {
            GSCollection.addReference(ref.field, ref.collectionName)
            collectionNames = [ref.collectionName]
          } else {
            collectionNames = ref.collectionName
          }

          if (ref.hasOwnProperty('relatedField')) {
            collectionNames.forEach(collectionName => {
              const relatedGSCollection = this.GSCollections[collectionName]
              relatedGSCollection.addReference(ref.relatedField, collection.name)
            })
          }
        }
      }
    }
  }
  async loadGSCollectionsData () {
    const { collections } = this.options

    for (const collection of collections) {


      const data = await this.getCollectionItems(collection)

      this.GSCollectionsData[collection.name] = {}

      for(let item of data) {
        if (collection.hasOwnProperty('downloadImages') && collection.downloadImages)
          item = await this.getImages(item);

        if(collection.hasOwnProperty('downloadFiles') && collection.downloadFiles)
          item = await this.getFiles(item);

        this.GSCollectionsData[collection.name][item.id] = item
      }

    }
  }
  updateReferenceFieldsForData () {
    const { collections } = this.options

    for (const collection of collections) {

      for (const itemId in this.GSCollectionsData[collection.name]) {

        if (collection.hasOwnProperty('refs')) {
          this.setReference(this.GSCollectionsData[collection.name][itemId], collection.refs)
        }
      }
    }
  }
  addDataToGSCollections () {
    for (const collectionName in this.GSCollections) {
      for (const dataId in this.GSCollectionsData[collectionName]) {
        const item = this.GSCollectionsData[collectionName][dataId]
        this.GSCollections[collectionName].addNode(item)
      }
    }
  }

  async getCollectionItems (collection) {

    if (!collection.hasOwnProperty('name'))
      this.error('The collection cannot be identified (the name field is missing)')

    if (!collection.hasOwnProperty('queryParams'))
      collection.queryParams = defaultOptions.queryParams
    else if (!collection.queryParams.hasOwnProperty('limit'))
      collection.queryParams.limit = -1;

    try {
      const response = await this.client.items(collection.directusPathName || collection.name).readMany({
        ...collection.queryParams
      });

      return collection.singleton? [response.data] : response.data
    } catch (e) {
      this.error(`Can not load data for collection '${collection.name}' \n\n ${e}`)
    }
  }
  async getImages (item) {
    for(const itemKey in item) {
      const itemContent = item[itemKey];

      if(itemContent && itemContent.type && imageTypes.includes(itemContent.type))
        item[itemKey].gridsome_image = await download(
            `${this.options.apiUrl}assets/${itemContent.id}`,
            itemContent.filename_disk,
            'Bearer ' + this.client.auth.token,
            './src/assets/static/.cache-directus/img-cache');

      else if(itemContent && itemKey !== 'owner' && typeof itemContent === 'object' && Object.keys(itemContent).length > 0)
        item[itemKey] = await this.getImages(itemContent);

    }

    return item;
  }
  async getFiles (item) {
    for(const itemKey in item) {
      const itemContent = item[itemKey];
      if(itemContent && itemContent.type && itemContent.data) {
        item[itemKey].gridsome_link = await download(
            `${this.options.apiUrl}files/${itemContent.id}`,
            itemContent.filename_disk,
            'Bearer ' + this.client.auth.token,
            './src/assets/static/.cache-directus/file-cache');

      } else if(itemContent && itemKey !== 'owner' && typeof itemContent === 'object' && Object.keys(itemContent).length > 0) {
        item[itemKey] = await this.getFiles(itemContent);
      }
    }

    return item;
  }


  getRefIds(item, source) {
    const pathParse = source.split('.')
    const now = pathParse.shift()

    if (pathParse.length === 0)
      return Array.isArray(item[now])? item[now]: [item[now]]

    if (Array.isArray(item[now]))
      return item[now].reduce((refIds, i) => refIds.concat(this.getRefIds(i, pathParse.join('.'))), [])

    return this.getRefIds(item[now], pathParse.join('.'))
  }
  setReference(item, refs) {
    for (const ref of refs) {
      const {source, field} = ref

      const refIds = this.getRefIds(item, source)
      delete item[source.split('.')[0]]

      item[field] = []

      for (const refId of refIds) {
        if (refId) {
          const collectionName = typeof refId === 'object' ? this.directusNameToCollectionName[refId.collection] : ref.collectionName;
          const dataId = typeof refId === 'object' ? Number.parseInt(refId.item) : refId;

          if (collectionName && dataId) {
            item[field + '__collection'] = collectionName
            item[field].push(dataId)
          }

        }
      }

      if (ref.hasOwnProperty('relatedField')) {

        for (const refId of refIds) {
          if (refId) {
            const collectionName = typeof refId === 'object' ? this.directusNameToCollectionName[refId.collection] : ref.collectionName;

            const dataId = typeof refId === 'object' ? Number.parseInt(refId.item) : refId;
            if (collectionName && dataId) {
              const relatedGSCollectionData = this.GSCollectionsData[collectionName]

              if (relatedGSCollectionData && relatedGSCollectionData.hasOwnProperty(dataId)) {
                const relatedItem = relatedGSCollectionData[dataId]
                if (relatedItem.hasOwnProperty(ref.relatedField))
                  relatedItem[ref.relatedField].push(item.id)
                else
                  relatedItem[ref.relatedField] = [item.id]

              }
            }

          }
        }

      }
    }
  }

  error (msg) {
    console.error(`DIRECTUS ERROR: ${msg}`);
    process.exit(1)
  }
  logSuccess (msg) {
    console.log(`%c DIRECTUS SUCCESS: ${msg}`, 'color: green;');
  }
  logInfo (msg) {
    console.log(`%c DIRECTUS: ${msg}`, 'color: blue;');
  }
}

module.exports = DirectusSource
