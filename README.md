# gridsome-source-directus
Плагин доставки контента для [Gridsome](https://gridsome.org/) из [Directus CMS](https://directus.io/) 

## Установка
- yarn add git+https://github.com/oookurs/gridsome-source-plugin
- Добавить `.cache-directus` в .gitignore файл, если вы не хотите версионировать скачанные файлы.

## Использование
Добавьте плагин в gridsome.config.js файл.

Примерная кофигурация:
```js
module.exports = {
  plugins: [
    {
      use: 'gridsome-source-directus',
      options: {
        apiUrl: 'YOUR_API_URL',
        project: 'YOUR_PROJECT_NAME OR _ FOR THE DEFAULT PROJECT',
        email: 'EMAIL_OF_DIRECTUS_USER',
        password: 'PASSWORD_OF_DIRECTUS_USER',
        collections: [
          {
            name: 'posts',
            status: 'published',
            fields: '*.*',
            downloadImages: true
          },
          {
            name: 'articel',
            hasRoute: true,
            fields: '*.*.*',
            downloadFiles: true
          },
          {
            name: 'products',
            directusPathName: '`directusproducts',
            route: '/product/:slug',
            fields: '*.*.*'
          }
        ]
      }
    }
  ]
}
```

### Авторизация
You have to create a directus user with the correct access rights (read) for the collections you want to fetch.

Simply add the email and password to the plugin options and the plugin will login via the credentials.

### Fetching the collections
To fetch your collections, you have mutiple options. Each collection is an object in the collections array of the plugin options.

It can have the following properties:
- `name` - The name of the collection (in Directus)
- `fields` - The fields directus should load
- `hasRoute` (optional) - If set to true, Gridsome will create a page from the data (with the schema `collection-name/:slug`). [See Templates for mor information](https://gridsome.org/docs/templates)
- `directusPathName` (optional) - If you want to have a different name in Gridsome, you can specify a directusPathName (collection name). This is handy, if you want to load data twice (e.g. for easy translation).
- `route` (optional) - If set, Gridsome will create pages with this route schema.
- `downloadImages` (optional) - If set to true, Gridsome will download all images from the collection. It will add the internal path to a new field `gridsome_image` in the image. You can use the [Gridsome image processing](https://gridsome.org/docs/images/#usage-via-graphql).
- `downloadFiles` (optional) - If set to true, Gridsome will download all fiels from the collection. It will add the internal path to a new field `gridsome_link` in the file.

Additionaly you can add aditional query parameters that are getting past along to directus.
[See the official Directus documentation for mor info](https://docs.directus.io/api/reference.html#query-parameters)
