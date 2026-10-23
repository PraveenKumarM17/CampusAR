<!-- Copy and paste the below one line command to start your campus mapping webite -->

``` bash
Copy-Item .env.docker .env; docker-compose build; docker-compose up -d; docker-compose exec api npm run db:migrate; docker-compose exec api npm run db:seed
```
``` bash
docker-compose build
docker-compose up -d
docker-compose logs -f
```

To restart the containers after stopping them, run the following command:

``` bash
docker-compose down
docker-compose build --no-cache web
docker-compose up -d
```