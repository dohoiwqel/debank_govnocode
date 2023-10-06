import puppeteer from 'puppeteer'
import axios from 'axios'
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as readline from 'readline'
import * as fs from 'fs'

async function read(fileName: string) {
    const array: string[] = []
    const readInterface = readline.createInterface({
        input: fs.createReadStream(fileName),
        crlfDelay: Infinity,
    })
    for await (const line of readInterface) {
        array.push(line)
    }
    return array
}

function getProxie(proxy: string) {
    const [ip, port, username, password] = proxy.split(':')
    const _proxy = {ip, port, username, password} 
    return _proxy
}

async function getBalance(wallet: string, proxy?: {ip: string, port: string, username: string, password: string}): Promise<number> {

    let args = [
        '--enable-features=NetworkService', 
        '--disable-site-isolation-trials',
    ]

    if(proxy) {
        args.push(`--proxy-server=http://${proxy.ip}:${proxy.port}`)
    }

    const browser = await puppeteer.launch({
        args: args,
        ignoreHTTPSErrors: true,
        headless: true
    });

    const response: any = await new Promise(async (resolve) => {
        const page = await browser.newPage();
    
        page.on('response', async (response) => {
            // console.log(response.request().headers())
            const requestHeaders = response.request().headers()
            if(requestHeaders['x-api-sign'] && requestHeaders['account']) {
                // console.log(requestHeaders)
                await browser.close()
                resolve(requestHeaders)
                return
            }
        })

        if(proxy) {
            await page.authenticate({
                username: proxy.username,
                password: proxy.password
            })
        }

        page.setUserAgent(`Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.75 Safari/537.36`)

        const url = `https://debank.com/profile/${wallet}`;
        await page.goto(url);
    })

    return response
}

async function makeRequest(headers: any, address: string, agent?: HttpsProxyAgent) {
    const response = await axios.get('https://api.debank.com/user/total_balance', {
        params: {
            'addr': address
        },
        headers: headers,
        httpsAgent: agent
    });
    return response.data.data.total_usd_value
}

async function main() {

    fs.writeFileSync('logs.txt' ,'')

    const wallets = await read('wallets.txt')
    const proxies = await read('proxies.txt')

    let total = 0
    const dataStor:{wallet: string, balance: number}[] =[]

    for(let [i, wallet] of wallets.entries()) {
        const proxy = proxies[i]? getProxie(proxies[i]): undefined
        const agent = proxy? new HttpsProxyAgent(`http://${proxy.username}:${proxy.password}@${proxy.ip}:${proxy.port}`): undefined

        console.log(wallet)
        const headers = await getBalance(wallet, proxy)
        const balance = await makeRequest(headers, wallet, agent)
        console.log(`${wallet} ${balance}$`)
        total+=balance; 
        dataStor.push({wallet: wallet, balance: balance})
        fs.appendFileSync('logs.txt', `${wallet} ${balance}$\n`)
    }

    fs.writeFileSync('logs.txt' ,'')
    dataStor.sort((a,b) => b.balance - a.balance)
    for(let i of dataStor) {
        fs.appendFileSync('logs.txt', `${i.wallet} ${i.balance}$\n`)
    }

    fs.appendFileSync('logs.txt', `Total$ ${total}$`)   
}

main()