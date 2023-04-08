const {gotScraping} = require("got-scraping");
const fs = require("fs");
const cheerio = require("cheerio");
const os = require('os');
const path = require('path');
const minimist = require('minimist');


let debug = false;
let requestOptions = {
    retry: {limit: 5},
    timeout: { request: 120000 }
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


async function bundleText({tidId, title}) {
    console.log(`[bundle text] ${title || tidId}`);
    let files = fs.readdirSync(`${__dirname}/data/${tidId}`).sort();
    let text = '';
    for (let f of files) {
        if (f.match(/\.txt$/)) {
            let p = path.join(`${__dirname}/data/${tidId}`, f);
            let buffer = await fs.readFileSync(p);
            text += buffer.toString();
            text += os.EOL + os.EOL + os.EOL;
        }
    }

    await fs.writeFile(`${__dirname}/data/${title || tidId}.txt`, text, err => {
        if (err) {
            console.error(err);
        }
    });
}

function isDebug() {
    return debug;
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
    if (isDebug()) {
        try {
            let buffer = await fs.readFileSync(`${__dirname}/data/${tidId}/${tidId}.html`);
            menuText = buffer.toString();
        } catch (e) {
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
            await fs.writeFile(`${__dirname}/data/${tidId}/${tidId}.html`, body, (err) => {
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

async function detailText({tidId, payload, contentTypePagination, pgTitle, sizeOfIndex = 10}) {
    console.log(`[DETAIL] ${tidId}`, {payload, pgTitle});

    let m = payload.match(/tuaid=(\d+)&chuongid=(\d+)/);
    let tuaid = m[1];
    let chuongid = m[2];
    let pageIndex = `${chuongid}`.padStart(sizeOfIndex, 0);

    let detailBody;

    if (isDebug()) {
        try {
            let buffer = await fs.readFileSync(`${__dirname}/data/${tidId}/${tuaid}_${pageIndex}.html`);
            detailBody = buffer.toString();
        } catch (e) {
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
            await fs.writeFile(`${__dirname}/data/${tidId}/${tuaid}_${pageIndex}.html`, body, err => {
                if (err) {
                    console.error(err);
                }
            });
        }
    }


    let data = detailBody.split('--!!tach_noi_dung!!--');

    // ten truyen, tac gia, so chuong
    let $ = cheerio.load(data[1]);
    let title = $('div.tuade h2 span.chuto40').text().trim() || pgTitle;
    let autor = $('span.tacgiaphaia').text().trim();

    let text = os.EOL + os.EOL + title + os.EOL + os.EOL + autor + os.EOL + os.EOL;
    let tieude = $('div.tieude0anh p span.chutieude').toArray();

    for (let t of tieude) {
        text += $(t).text().trim() + os.EOL;
    }

    if (chuongid === '1') {
        // anh bia
        let m = data[0].match(/background:url\(([^)]+)\)/);
        let imgUrl = m?.[1];
        if (imgUrl) {
            try {
                let stream = await gotScraping({
                    url: imgUrl,
                    headers: {...HeaderDetail(tidId)},
                    isStream: true
                });
                let buffer = await streamToBuffer(stream);
                await fs.writeFile(`${__dirname}/data/${title || tidId}.jpg`, buffer, 'binary', err => {
                    if (err) {
                        console.error(err);
                    }
                });
                console.log(`[DETAIL] ${tidId} Image ${title || tidId}.jpg saved`);
            } catch (e) {
                console.error(`[DETAIL] ${tidId} Image can not be saved!`)
                console.error(e);
            }
        }
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
    await fs.writeFile(`${__dirname}/data/${tidId}/${tuaid}_${pageIndex}.txt`, text, err => {
        if (err) {
            console.error(err);
        }
    });

}


async function startPage(tidId) {

    const {pageData = [], title = '', contentType: contentTypePagination = null} = await pagination({tidId});
    if (!contentTypePagination ||
        (contentTypePagination && !['moi', 'epub2', 'pdf', 'scan', 'audio'].includes(contentTypePagination))) {
        throw `Unsupported content type!!! ${contentTypePagination}`;
    }

    if (pageData.length === 0) {
        console.warn(`${title || tidId} has empty content.`)
        return;
    }

    let sizeOfIndex = `${pageData.length}`.length;
    for (let i = 0; i < pageData.length; i++) {
        let payload = pageData[i];

        // faster need to concurrency
        if (contentTypePagination === 'moi') {
            await detailText({tidId, payload,contentTypePagination, pgTitle: title, sizeOfIndex});
        } else {
            // todo
            console.error('to be implemented');
        }

        await sleep(random_bm());
    }

    if (contentTypePagination === 'moi') {
        await bundleText({tidId, title});
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

    let {tid: tidId, mode} = minimist(process.argv.slice(2));
    if (!tidId) {
        console.log("tid must be defined. For an example: npm run vnthuquan -- --tid 2qtqv3m3237nvnmnmntnvn31n343tq83a3q3m3237nvn");
        process.exit();
    }

    debug = mode === 'debug';

    if (!fs.existsSync(`${__dirname}/data/${tidId}`)) {
        fs.mkdirSync(`${__dirname}/data/${tidId}`, {recursive: true});
    }

    await startPage(tidId);

}

main();
