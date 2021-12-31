FROM node:16-alpine

RUN apk update \
    && apk add vim curl subversion git yarn

WORKDIR /home/wwwroot/fractaleyez/

COPY . /home/wwwroot/fractaleyez/
