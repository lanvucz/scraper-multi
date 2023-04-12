const {gotScraping} = require("got-scraping");
const fs = require("fs");
const cheerio = require("cheerio");
const os = require('os');
const path = require('path');
const minimist = require('minimist');
const Epub = require("epub-gen");

let debug = false;
let format;
let requestOptions = {
    retry: {limit: 5},
    timeout: {request: 120000}
}

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
    let {tidId, title} = data;
    let outputFormat = getFormat();
    console.log(`[bundle] ${outputFormat} ${title || tidId}`);
    if (outputFormat === 'txt') {
        await bundleText(data);
    } else if (outputFormat === 'epub') {
        await bundleEpub(data);
    }
}

async function bundleText({tidId, title, content}) {
    console.log(`[bundle text] ${title || tidId}`);
    // let files = fs.readdirSync(`${__dirname}/data/${tidId}`).sort();
    // let text = '';
    // for (let f of files) {
    //     if (f.match(/\.txt$/)) {
    //         let p = path.join(`${__dirname}/data/${tidId}`, f);
    //         let buffer = await fs.readFileSync(p);
    //         text += buffer.toString();
    //         text += os.EOL + os.EOL + os.EOL;
    //     }
    // }

    // await fs.writeFile(`${__dirname}/data/${title || tidId}.txt`, text, err => {
    //     if (err) {
    //         console.error(err);
    //     }
    // });
    await fs.writeFile(`${__dirname}/data/${title || tidId}.txt`, content, err => {
        if (err) {
            console.error(err);
        }
    });
}

async function bundleEpub({tidId, title, author, coverPath, content: contentText}) {
    console.log(`[bundle epub] ${title || tidId}`);
    // let files = fs.readdirSync(`${__dirname}/data/${tidId}`).sort();

    let content = contentText.split('--!!tach_noi_dung!!--').filter(v => v).map(data => {
        return {data}
    });
    const option = {
        title: title || tidId,
        author: author || 'unknown',
        cover: coverPath,
        content
    };

    await new Epub(option, `${__dirname}/data/${title || tidId}.epub`).promise.then(
        () => console.log("Ebook Generated Successfully!"),
        err => console.error("Failed to generate Ebook because of ", err)
    );
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
    return `${host}/truyen/chuonghoi_${contentType}.aspx?&rand=${rand}`;
}

async function pagination({tidId}) {
    console.log('[PAGINATION]', {tidId});
    let menuText;
    let paginationCachedFile = `${__dirname}/data/${tidId}/${tidId}.html`;
    if (isDebug() && fs.existsSync(paginationCachedFile)) {
        try {
            let buffer = await fs.readFileSync(paginationCachedFile);
            menuText = buffer.toString();
        } catch (e) {
            console.error('[PAGINATION] Failed to load cache!');
        }
    }

    if (!menuText) {
        let paginationResponse = await gotScraping({
            url: `${host}/truyen/truyen.aspx?tid=${tidId}&AspxAutoDetectCookieSupport=1`,
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
        pageData.push(oneChapter + '1');
    }

    let contentType = getContentType(menuText);

    console.log('Found', {contentType, title, pageData: JSON.stringify(pageData)});
    // if (isDebug()) {
    //     pageData = [pageData[0]];
    //     console.debug('Debug', {title, pageData});
    // }
    return {title, contentType, pageData};
}

function getContent(detailBody, pgTitle = '') {
    let data = detailBody.split('--!!tach_noi_dung!!--');
    let $ = cheerio.load(data[1]);
    let title = $('div.tuade h2 span.chuto40').text().trim() || pgTitle;
    let author = $('span.tacgiaphaia').text().trim();
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
        content = '<div>' + data[1] + data[2] + '</div>' + '--!!tach_noi_dung!!--';
    }
    return {title, author, content};
}

async function detail({tidId, payload, contentTypePagination, pgTitle, sizeOfIndex = 10}) {
    console.log(`[DETAIL] ${tidId}`, {payload, pgTitle});

    let m = payload.match(/tuaid=(\d+)&chuongid=(\d+)/);
    let tuaid = m[1];
    let chuongid = m[2];
    let pageIndex = `${chuongid}`.padStart(sizeOfIndex, 0);

    let detailBody;

    let detailCachedFile = `${__dirname}/data/${tidId}/${tuaid}_${pageIndex}.html`;
    if (isDebug() && fs.existsSync(detailCachedFile)) {
        try {
            let buffer = await fs.readFileSync(detailCachedFile);
            detailBody = buffer.toString();
        } catch (e) {
            console.error('[DETAIL] Failed to load cache!');
        }
    }

    if (!detailBody) {
        let detailResponse = await gotScraping({
            url: getDetailUrl(contentTypePagination),
            headers: {...HeaderDetail(tidId)},
            method: "POST",
            body: payload,
            ...requestOptions,
        });
        let {
            body,
            statusCode,
        } = detailResponse;
        console.debug({tidId, payload, statusCode});
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
    let {title, author, content} = getContent(detailBody, pgTitle);

    // // ten truyen, tac gia, so chuong
    // let $ = cheerio.load(data[1]);
    // let title = $('div.tuade h2 span.chuto40').text().trim() || pgTitle;
    // let author = $('span.tacgiaphaia').text().trim();
    //
    // let text = os.EOL + os.EOL + title + os.EOL + os.EOL + author + os.EOL + os.EOL;
    // let tieude = $('div.tieude0anh p span.chutieude').toArray();
    //
    // for (let t of tieude) {
    //     text += $(t).text().trim() + os.EOL;
    // }

    // cover
    let coverPath;
    if (chuongid === '1') {
        // anh bia
        let m = data[0].match(/background:url\(([^)]+)\)/);
        let imgUrl = m?.[1];
        if (imgUrl) {
            let cover = `${__dirname}/data/${title || tidId}.jpg`;
            if (!fs.existsSync(cover)) {
                try {
                    let stream = await gotScraping({
                        url: imgUrl,
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


    // chuong truyen
    // $ = cheerio.load(data[2]);
    // let imgSrc = $('div#chuhoain img.noborder[src]:not([src=""])').attr('src');
    // if (imgSrc) {
    //     let char = imgSrc.match(/cotich_(\w)\.png$/)?.[1];
    //     if (char) {
    //         text = text + char;
    //     }
    // let truyen = data[2].replaceAll("<div style='height:10px;'></div>", os.EOL);
    // text += cheerio.load(truyen).text().trim();
    // text += os.EOL + os.EOL;
    // await fs.writeFile(`${__dirname}/data/${tidId}/${tuaid}_${pageIndex}.txt`, text, err => {
    //     if (err) {
    //         console.error(err);
    //     }
    // });
    // }
    return {title, author, coverPath, content};
}


async function startPage(tidId) {
    const {pageData = [], title: pgTitle = '', contentType: contentTypePagination = null} = await pagination({tidId});
    let title = pgTitle;
    if (!contentTypePagination ||
        (contentTypePagination && !['moi', 'epub2', 'pdf', 'scan', 'audio'].includes(contentTypePagination))) {
        throw `Unsupported content type!!! ${contentTypePagination}`;
    }

    if (pageData.length === 0) {
        console.warn(`${title || tidId} has empty content.`)
        return;
    }
    let author, coverPath, content = '';
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
                content += contentI;
            }
            if (!title && titleI) {
                title = titleI;
            }
        } else {
            // todo
            console.error('to be implemented');
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


async function main() {

    let {tid: tidId, mode, format: outputFormat = 'epub'} = minimist(process.argv.slice(2));
    if (!tidId) {
        console.log("tid must be defined. For an example: npm run vnthuquan -- --tid 2qtqv3m3237nvnmnmntnvn31n343tq83a3q3m3237nvn");
        process.exit();
    }

    debug = mode === 'debug';
    format = outputFormat;

    if (isDebug()) {
        if (!fs.existsSync(`${__dirname}/data/${tidId}`)) {
            fs.mkdirSync(`${__dirname}/data/${tidId}`, {recursive: true});
        }
    }
    await startPage(tidId);

}

main();
