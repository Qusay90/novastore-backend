const https = require('https');
https.get('https://cloudflare-dns.com/dns-query?name=db.ytiqiljtopsinlbkweop.supabase.co&type=A', {
    headers: { 'accept': 'application/dns-json' }
}, (res) => {
    let data = ''; res.on('data', c => data += c);
    res.on('end', () => {
        const d = JSON.parse(data);
        if(d.Answer) {
            d.Answer.forEach(a => console.log(a.data));
        } else {
            console.log("No answer", d);
        }
    });
});
