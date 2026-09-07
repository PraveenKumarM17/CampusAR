<!-- Copy and paste the below one line command to start your campus mapping webite -->

``` bash
Copy-Item .env.docker .env; docker-compose build; docker-compose up -d; docker-compose exec api npm run db:migrate; docker-compose exec api npm run db:seed
```
``` bash
docker-compose build
docker-compose up -d
docker-compose logs -f
```