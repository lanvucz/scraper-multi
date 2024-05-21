const got = require('got')
const fs = require("fs");
const cheerio = require("cheerio");
const os = require('os');
const minimist = require('minimist');
const Epub = require("epub-gen");
const { createCanvas } = require("canvas");
const path = require('path');

let debug = false;
let format;
let requestOptions = {
    retry: {limit: 5},
    timeout: {request: 120000}
}
let getCover = true;
const cwd = process.cwd();

const host = 'http://vietnamthuquan.eu';
const HeaderPagination = {
    accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "en-US,en;q=0.9",
    "sec-ch-ua": '"Google Chrome";v="111", "Not(A:Brand";v="8", "Chromium";v="111"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    cookie: "AspxAutoDetectCookieSupport=1",
};

const HeaderDetail = (tid) => {
    return {
        accept: "*/*",
        "accept-language": "en-US,en;q=0.9",
        "content-type": "application/x-www-form-urlencoded",
        "sec-ch-ua": '"Google Chrome";v="111", "Not(A:Brand";v="8", "Chromium";v="111"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        //                          "cookie": "AspxAutoDetectCookieSupport=1; ASP.NET_SessionId=ifm3frrjwtefqe552r0zsjbs",
        Referer: `${host}/truyen/truyen.aspx?tid=${tid}&AspxAutoDetectCookieSupport=1`,
        "Referrer-Policy": "strict-origin-when-cross-origin",
    };
};

async function bundle(data) {
    let {tidId, title, author} = data;
    if (title) {
        data.title = title.replace(/"/g, '');
    }
    if (author) {
        data.author = author.trim().split(/\s/).filter(v => v).map(v => v.charAt(0).toUpperCase() + v.slice(1)).join(' ');
    }
    let outputFormat = getFormat();
    console.log(`[BUNDLE] ${tidId}`, {title, format: outputFormat});
    if (outputFormat === 'txt') {
        await bundleText(data);
    } else if (outputFormat === 'epub') {
        await bundleEpub(data);
    } else {
        console.error(`[BUNDLE] ${tidId} Format ${outputFormat} not supported!`, {title, format: outputFormat})
    }
}

async function bundleText({tidId, title, content}) {
    console.log(`[BUNDLE TXT] ${tidId}`, {title, format: 'txt'});
    // let files = fs.readdirSync(`${cwd}/data/${tidId}`).sort();
    // let text = '';
    // for (let f of files) {
    //     if (f.match(/\.txt$/)) {
    //         let p = path.join(`${cwd}/data/${tidId}`, f);
    //         let buffer = await fs.readFileSync(p);
    //         text += buffer.toString();
    //         text += os.EOL + os.EOL + os.EOL;
    //     }
    // }

    // await fs.writeFile(`${cwd}/data/${title || tidId}.txt`, text, err => {
    //     if (err) {
    //         console.error(err);
    //     }
    // });
    let text = content.join('');
    await fs.writeFile(`${cwd}/${title || tidId}.txt`, text, err => {
        if (err) {
            console.error(err);
        }
    });
}
async function generateCover({title, author, chapterCount}){
    let WIDTH = 600;
    let HEIGHT = 800;

    let canvas = createCanvas(WIDTH, HEIGHT);
    let ctx = canvas.getContext("2d");

    ctx.fillStyle = "#f2f2f2";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#222222";
    ctx.font = "50px Arial";
    let titleArr = title.split(/\s/);
    let titleBreaks = [];
    let s = [];
    for (let w of titleArr) {
        s.push(w);
        if (s.join(' ').length > 20){
            s.pop();
            titleBreaks.push(s.join(' '));
            s = [w];
        }
    }
    titleBreaks.push(s.join(' '));
    let positionY = 200;
    for (let tb of titleBreaks) {
        ctx.fillText(tb, 50, positionY);
        positionY += 60;
    }
    ctx.font = "32px Arial";
    ctx.fillText(author, 100, 450);

    ctx.fillText("Chapters: " + chapterCount, 50, 600);

    let buffer = canvas.toBuffer("image/png");
    fs.writeFileSync(title + ".png", buffer);
    let coverPath = path.join(cwd, `${title}.png`);
    return coverPath;
}

async function bundleEpub({tidId, title, author, coverPath, content}) {
    console.log(`[BUNDLE EPUB] ${tidId}`, {title});
//    let coverGenerated = false;
        coverPath = await generateCover({title, author, chapterCount: content.length});
//    if (!coverPath){
//        coverGenerated = true;
//    }


    const option = {
        title: title || tidId,
        author: author || 'unknown',
        publisher: 'vnthuquan',
        ...(coverPath && {cover: coverPath}),
        css: `.tacgiaphaia{color:#666633; font-size:1.8em; text-transform: capitalize; float:right;  text-shadow: 4px 4px 4px #c0c2a2;}
.tacgiaphai{font-style:italic; font-size:1.25em; margin:0.5em 0 0; padding-bottom:10px; clear:both; color:#5B776E;}
`,
        content
    };

    await new Epub(option, path.join(cwd, `${title || tidId}.epub`)).promise.then(
        () => console.log("Ebook Generated Successfully!"),
        err => console.error("Failed to generate Ebook", err)
    );
//    if (coverPath) {
//        // fixme gen-epub do not do correctly metadata for cover image. Investigate
////         fs.unlinkSync(coverPath);
//    }
}

function isDebug() {
    return debug;
}

function getFormat() {
    return format;
}

function getContentType(html) {
    return html.match(/SendQuery\('chuonghoi_([^.]+).aspx\?'/)?.[1];
}

function getDetailUrl(contentType) {
    let timestamp = (new Date()).getTime().toString();
    let rand =
        timestamp.substring(0, 3) +
        "." +
        timestamp.substring(4, timestamp.length);
    return `${host}/truyen/chuonghoi_${contentType}.aspx?=&rand=${rand}`;
}

async function pagination({tidId}) {
    console.log('[PAGINATION]', tidId);
    let menuText;
    let paginationCachedFile = `${cwd}/data/${tidId}/${tidId}.html`;
    if (isDebug() && fs.existsSync(paginationCachedFile)) {
        try {
            let buffer = await fs.readFileSync(paginationCachedFile);
            menuText = buffer.toString();
        } catch (e) {
            console.error('[PAGINATION] Failed to load cache!');
        }
    }

    if (!menuText) {
        let paginationUrl = `${host}/truyen/truyen.aspx?tid=${tidId}&AspxAutoDetectCookieSupport=1`;
        let paginationResponse = await got.get(paginationUrl, {
            headers: {...HeaderPagination},
            ...requestOptions
        });
        let {body} = paginationResponse;
        if (isDebug()) {
            await fs.writeFile(paginationCachedFile, body, (err) => {
                if (err) {
                    console.error(err);
                }
            });
        }
        menuText = body;
    }


    let $ = cheerio.load(menuText);

    let title = $("h3.mucluc a:not([href])").text();

    let chapters = $('div#saomu acronym li[onClick*="noidung1"]').toArray();
    let pageData = [];
    for (let c of chapters) {
        let el = $(c);
        let text = el.attr("onclick");
        let m = text.match(/tuaid=(\d+)&chuongid=(\d+)/);
        pageData.push(m[0]);
    }

    if (pageData.length === 0) {
        let oneChapter = menuText.match(/noidung1\('(tuaid=(\d+)&chuongid=)'\)/)?.[1];
        // pageData.push(oneChapter + '1');
        pageData.push(oneChapter);
    }

    let contentType = getContentType(menuText);

    console.log('[PAGINATION]', tidId, 'Found', {
        url: `${host}/truyen/truyen.aspx?tid=${tidId}&AspxAutoDetectCookieSupport=1`,
        contentType, title, pageData: JSON.stringify(pageData)
    });
    // if (isDebug()) {
    //     pageData = [pageData[0], pageData[1], pageData[2]];
    //     console.debug('Debug', {title, pageData});
    // }
    return {title, contentType, pageData};
}

function getDetailContent(detailBody, pgTitle = '') {
    let data = detailBody.split('--!!tach_noi_dung!!--');
    let $ = cheerio.load(data[1]);
    let title = $('div.tuade h2 span.chuto40').text().trim() || pgTitle;
    let author = $('span.tacgiaphaia').text().trim();

    let chapterTitle = $('div.tieude0anh p span.chutieude').toArray().slice(-2).map(t => $(t).text().trim()).filter(v => v).join(' - ');

    let content;

    let outputFormat = getFormat();
    if (outputFormat === 'txt') {
        // ten truyen, tac gia, so chuong
        let text = os.EOL + os.EOL + title + os.EOL + os.EOL + author + os.EOL + os.EOL;
        let tieude = $('div.tieude0anh p span.chutieude').toArray();

        for (let t of tieude) {
            text += $(t).text().trim() + os.EOL;
        }
        // chuong truyen
        $ = cheerio.load(data[2]);
        let imgSrc = $('div#chuhoain img.noborder[src]:not([src=""])').attr('src');
        if (imgSrc) {
            let char = imgSrc.match(/cotich_(\w)\.png$/)?.[1];
            if (char) {
                text = text + char;
            }
        }
        let truyen = data[2].replaceAll("<div style='height:10px;'></div>", os.EOL);
        text += cheerio.load(truyen).text().trim();
        text += os.EOL + os.EOL;
        content = text;
    } else if (outputFormat === 'epub') {
        $ = cheerio.load(data[2]);
        let img = $('div#chuhoain img.noborder[src]:not([src=""])');
        let imgSrc = img.attr('src');
        if (imgSrc) {
            let char = imgSrc.match(/cotich_(\w)\.png$/)?.[1];
            if (char) {
                $('div#chuhoain').remove();
                let text = $('body').html().replace('class="chuhoavn"> ', 'class="chuhoavn">' + char);
                $ = cheerio.load(text);
            }
        }
        $('img[src]:not([src=""])').remove();
        let body = $('body').html();

        content = {
            ...(chapterTitle && {title: chapterTitle}),
            data: '<div> <div style="padding: 3px 0 45px 0;">' + data[1] + '</div>' + body + '</div>'
        };
    }
    return {title, author, content};
}

async function detail({tidId, payload, contentTypePagination, pgTitle, sizeOfIndex = 10}) {
    console.log(`[DETAIL] ${tidId}`, {payload, pgTitle});

    let m = payload.match(/tuaid=(\d+)&chuongid=(\d+|)/);
    let tuaid = m[1];
    let chuongid = m[2] || '1';
    let pageIndex = `${chuongid}`.padStart(sizeOfIndex, 0);

    let detailBody;

    let detailCachedFile = `${cwd}/data/${tidId}/${tuaid}_${pageIndex}.html`;
    if (isDebug() && fs.existsSync(detailCachedFile)) {
        try {
            let buffer = await fs.readFileSync(detailCachedFile);
            detailBody = buffer.toString();
        } catch (e) {
            console.error(`[DETAIL] ${tidId} Failed to load cache!`);
        }
    }

    if (!detailBody) {
        let detailUrl = getDetailUrl(contentTypePagination);

        let detailResponse = await got.post(detailUrl, {
            headers: {...HeaderDetail(tidId)},
            body: payload,
            ...requestOptions,
        });
        let {
            statusCode,
            body
        } = detailResponse;

        console.debug(`[DETAIL] ${tidId}`, {url: detailUrl, payload, statusCode});
        detailBody = body;

        if (isDebug()) {
            await fs.writeFile(detailCachedFile, body, err => {
                if (err) {
                    console.error(err);
                }
            });
        }
    }


    let data = detailBody.split('--!!tach_noi_dung!!--');
    let {title, author, content} = getDetailContent(detailBody, pgTitle);


    // cover
    let coverPath;
    if (chuongid === '1' && getCover) {
        // anh bia
        let m = data[0].match(/background:url\(([^)]+)\)/);
        let imgUrl = m?.[1];
        if (imgUrl) {
            let cover = `${cwd}/${title || tidId}.jpg`;
            if (!fs.existsSync(cover)) {
                try {
                    let stream = await got.stream(imgUrl, {
                        headers: {...HeaderDetail(tidId)},
                        isStream: true
                    });
                    let buffer = await streamToBuffer(stream);
                    await fs.writeFile(cover, buffer, 'binary', err => {
                        if (err) {
                            console.error(err);
                        }
                    });
                    console.log(`[DETAIL] ${tidId} Image ${cover} saved`);
                    coverPath = cover;
                } catch (e) {
                    console.error(`[DETAIL] ${tidId} Image can not be saved!`)
                    console.error(e);
                }
            }
        }
    }


    return {title, author, coverPath, content};
}


async function startPage(tidId) {
    const {pageData = [], title: pgTitle = '', contentType: contentTypePagination = null} = await pagination({tidId});
    let title = pgTitle;
    if (!contentTypePagination ||
        (contentTypePagination && !['moi', 'epub2', 'pdf', 'scan', 'audio'].includes(contentTypePagination))) {
        throw `[START] ${tidId} ${title} Unsupported content type!!! ${contentTypePagination}`;
    }

    if (pageData.length === 0) {
        console.warn(`[START] ${tidId} ${title} has empty content.`)
        return;
    }
    let author, coverPath, content = [];
    let sizeOfIndex = `${pageData.length}`.length;
    for (let i = 0; i < pageData.length; i++) {
        let payload = pageData[i];

        // faster need to concurrency
        if (contentTypePagination === 'moi') {
            let {author: authorI, coverPath: coverI, content: contentI, title: titleI} = await detail({
                tidId,
                payload,
                contentTypePagination,
                pgTitle: title,
                sizeOfIndex
            });
            if (!author && authorI) {
                author = authorI;
            }
            if (!coverPath && coverI) {
                coverPath = coverI;
            }
            if (contentI) {
                content.push(contentI);
            }
            if (!title && titleI) {
                title = titleI;
            }
        } else {
            // todo
            console.error('[START] to be implemented', contentTypePagination);
        }

        await sleep(random_bm());
    }

    if (contentTypePagination === 'moi') {
        await bundle({tidId, title, author, coverPath, content});
    }

}

const streamToBuffer = async (stream) => {
    const chunks = [];
    return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
};

const getNumberBetween0And1 = () => {
    let u = Math.random();
    let v = Math.random();
    while (u === 0) {
        u = Math.random();
    }
    while (v === 0) {
        v = Math.random();
    }
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
};

// Normal Distribution
const random_bm = (min = 900, max = 2000) => {
    let num = getNumberBetween0And1();
    let retries = 1000;
    while ((num > 1 || num < 0) && retries > 0) {
        retries -= 1;
        num = getNumberBetween0And1();
    }
    num = num / 10.0 + 0.5; // Translate to 0 -> 1
    num *= max - min; // Stretch to fill range
    num += min; // offset to min
    return num;
};

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function findTid(arr) {
    for (let v of arr){
        try {
            return (new URL(v)).searchParams.get('tid');
        } catch {
            continue;
        }
    }
    return null;
}

async function main() {

    let {tid: tidId, debug: modeDebug = false, format: outputFormat = 'epub'} = minimist(process.argv.slice(2));
    if (!tidId) {
        tidId =findTid(process.argv.slice(2))
    }
    let tidIds = tidId ? [tidId] : [];
    if (!tidId) {
        let filePath = path.join(cwd, process.argv.slice(2)[0]);
        if (fs.existsSync(filePath)){
            console.log(filePath);
//            let data = fs.openSync(filePath, 'r');
//            console.log(data);
             let input = (fs.readFileSync(filePath))
                            .toString().trim()
                            .split(/\r?\n/)
             if (input) {
                for (let v of input) {
                    try {
                        let tid = (new URL(v)).searchParams.get('tid');
                         tidIds.push(tid);
                    } catch {
                        continue;
                    }
                }
             }
        }
    }
//console.log(tidIds)

    if (!tidIds) {
        console.log("tid must be defined. For an example: npm run vnthuquan -- --tid 2qtqv3m3237nvnmnmntnvn31n343tq83a3q3m3237nvn");
        process.exit();
    }

    debug = !!modeDebug;
    format = outputFormat;
    for (let tid of tidIds) {
        if (isDebug()) {
            let dirPath = path.join(cwd, 'data', `${tid}`);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, {recursive: true});
            }
        }
        await startPage(tid);
    }

}

main();
