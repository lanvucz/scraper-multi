#### Version
```
npm -v
8.12.1

node -v
v18.5.0

npx -v
8.12.1

pkg -v
5.8.1
```
#### vnthuquan
1.
```
npm run vnthuquan -- --tid insert_tid_here
--tid       2qtqv3m3237nvntnmn4n4n31n343tq83a3q3m3237nvn from url https://vnthuquan.net/truyen/truyen.aspx?tid=2qtqv3m3237nvntnmn4n4n31n343tq83a3q3m3237nvn
--debug     save html to rerun. Default not debug
--format    epub txt : choose a format to be generated. Default epub
```

2.
input.txt
```
http://vietnamthuquan.eu/truyen/truyen.aspx?tid=2qtqv3m3237n1ntnmn0n0n31n343tq83a3q3m3237nvn
http://vietnamthuquan.eu/truyen/truyen.aspx?tid=2qtqv3m3237n1ntn4nmn4n31n343tq83a3q3m3237nvn
```

```
npm run vnthuquan input.txt
```
3.
```
npm run vnthuquan http://vietnamthuquan.eu/truyen/truyen.aspx?tid=2qtqv3m3237n1nvntnnn1n31n343tq83a3q3m3237nvn
```

```
npm run vnthuquan http://vietnamthuquan.eu/truyen/truyen.aspx?tid=2qtqv3m3237n1nvntnnn1n31n343tq83a3q3m3237nvn -- --debug
```
### Executable
##### [Node Single executable applications](https://nodejs.org/api/single-executable-applications.html)

Node 19.9.0
```
$ echo 'console.log(`Hello, ${process.argv[2]}!`);') > hello.js
cp $(command -v node) hello
signtool remove /s hello.exe
npx postject hello.exe NODE_JS_CODE hello.js --sentinel-fuse NODE_JS_FUSE_fce680ab2cc467b6e072b8b5df1996b2
signtool sign /fd SHA256 hello.exe
$ ./hello world
Hello, world!
```
Node 20.0.0
```
echo 'console.log(`Hello, ${process.argv[2]}!`);' > hello.js
echo '{ "main": "hello.js", "output": "sea-prep.blob" }' > sea-config.json
.\hello.exe --experimental-sea-config sea-config.json
signtool remove /s hello.exe
npx postject hello.exe NODE_SEA_BLOB sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
signtool sign /fd SHA256 hello.exe
```
##### Build executable .exe to run in cmd
Build:
For node 18 `pkg  vnthuquan/index.js -o executable/vnthuquan.exe`

For other node version `pkg -t node18 vnthuquan/index.js -o executable/vnthuquan.exe`

Run `.\vnthuquan.exe --debug --tid 2qtqv3m3237nvnmn4n4nqn31n343tq83a3q3m3237nvn`

## Todo
remove epub-gen and write epub generation
