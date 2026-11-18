#!/usr/bin/env python3
"""Builds the Learn section (public/learn/...) from the articles below, using the
contact page as the template for the header and footer. Run after editing articles:
python3 scripts/build-learn.py && python3 scripts/bump-assets.py"""
import html, json, os, re

ROOT = os.path.join(os.path.dirname(__file__), '..', 'public')
TPL = open(os.path.join(ROOT, 'contact', 'index.html')).read()
SITE = 'https://probisco.in'
DATE = '2026-11-18'
NIN = 'https://www.nin.res.in/rdabook/brief_note.pdf'

CTA = '''<div class="callout"><strong>Try ProBisCo.</strong> Six crunchy chocolate chip cookies with 30g of plant protein in the jar, about 5g in each cookie. 100% eggless, no whey, lab-tested. <a href="/chocolate-chip-protein-cookies/">See the jar</a>.</div>'''

ARTICLES = [
  {
    'slug': 'protein-cookies-vs-protein-bars',
    'title': 'Protein Cookies vs Protein Bars: Which Snack Fits Your Day?',
    'short': 'Protein cookies vs protein bars',
    'desc': 'How protein cookies and protein bars compare on protein, sugar, texture and when to eat them, and how to read their labels before you buy.',
    'body': f'''
<p>Protein bars have been the default "healthy snack" in gym bags for years. Protein cookies are newer. Both promise more protein than an ordinary snack, but they are built differently, and the right choice depends on what you want from a snack.</p>
<h2>What each one is</h2>
<p>A <strong>protein bar</strong> is usually a pressed or chewy bar held together with syrups, nut butters or binders, with protein powder mixed in. Many are designed to replace a small meal and can carry a lot of protein in one bar.</p>
<p>A <strong>protein cookie</strong> is baked, like a regular biscuit, with part of the flour replaced by protein-rich ingredients such as soya protein, whey, almond flour or oats. It is closer to a normal cookie in taste and texture, and usually has less protein per piece than a big bar.</p>
<h2>How they compare</h2>
<table><thead><tr><th scope="col"></th><th scope="col">Protein bar</th><th scope="col">Protein cookie</th></tr></thead><tbody>
<tr><th scope="row">Texture</th><td>Chewy or dense</td><td>Baked: crunchy or soft</td></tr>
<tr><th scope="row">Protein per piece</th><td>Often higher per bar</td><td>Usually lower per cookie; eat two for more</td></tr>
<tr><th scope="row">Portion</th><td>One bar, all or nothing</td><td>Easy to have one or two</td></tr>
<tr><th scope="row">Feels like</th><td>A supplement</td><td>A snack you'd eat anyway</td></tr>
</tbody></table>
<p>These are general patterns. Products in both groups vary a lot, so the label always beats the category.</p>
<h2>What to check on the label</h2>
<ul>
<li><strong>Protein per 100g and per piece.</strong> Per 100g tells you how protein-dense the food is. Per piece tells you what you actually eat. Our guide to <a href="/learn/how-to-read-protein-on-food-labels/">reading protein on labels</a> explains both.</li>
<li><strong>Added sugar.</strong> Some bars and cookies are high in sugar or use sugar alcohols. Neither is automatically a problem, but you should know what you are eating.</li>
<li><strong>Protein source.</strong> Whey and milk proteins come from dairy; soya, pea and nut proteins come from plants. See <a href="/learn/plant-protein-vs-whey/">plant protein vs whey</a>.</li>
<li><strong>Calories.</strong> A snack that fits your day is one you can count, not one you guess at.</li>
</ul>
<h2>When each one makes sense</h2>
<p>If you want the most protein in a single piece, for example after a hard session when you won't eat a meal for hours, a well-made protein bar is hard to beat.</p>
<p>If you want something you will actually look forward to at the 4 PM break or with chai, and a few extra grams of protein matter more to you than the maximum, a protein cookie is the easier habit to keep. A snack that you enjoy is one you will reach for instead of a regular biscuit.</p>
<h2>Where ProBisCo fits</h2>
<p>ProBisCo is a crunchy, baked chocolate chip cookie. Each 31g cookie has about 5g of protein and 115 kcal, and a jar of six has 30g of protein in total. An independent lab measured 16.32g of protein per 100g (<a href="/lab-report/">see the report</a>). It is not trying to be the most protein-dense snack you can buy. It is trying to be a cookie you'd eat anyway, with more protein than a regular one.</p>
{CTA}
''',
  },
  {
    'slug': 'plant-protein-vs-whey',
    'title': 'Plant Protein vs Whey: What Is the Difference?',
    'short': 'Plant protein vs whey',
    'desc': 'Whey comes from milk; plant proteins come from soya, peas, nuts and grains. How they differ in source, digestion, allergens and diet fit.',
    'body': f'''
<p>"Plant protein or whey?" is one of the most common questions people ask when they start paying attention to protein. Both can be part of a good diet. The difference is mostly about where the protein comes from and what else comes with it.</p>
<h2>What whey is</h2>
<p>Whey is the liquid left behind when milk is turned into cheese or paneer. It is dried and filtered into powders. <strong>Whey concentrate</strong> still contains some milk sugar (lactose) and fat; <strong>whey isolate</strong> is filtered further and has less of both. Whey is a dairy product, so it suits vegetarians who eat dairy, but not vegans or people with a milk allergy.</p>
<h2>What plant protein is</h2>
<p>Plant protein comes from foods such as soya, peas, lentils, nuts and grains. <strong>Soya protein isolate</strong>, the main protein in ProBisCo, is made from soybeans and contains all nine essential amino acids, which makes it one of the most complete plant proteins. Almond flour and oats add smaller amounts of protein along with flavour and texture.</p>
<h2>Side by side</h2>
<table><thead><tr><th scope="col"></th><th scope="col">Whey</th><th scope="col">Plant protein (e.g. soya)</th></tr></thead><tbody>
<tr><th scope="row">Source</th><td>Milk</td><td>Soybeans, peas, nuts, grains</td></tr>
<tr><th scope="row">Contains lactose</th><td>Concentrate: some. Isolate: little.</td><td>No</td></tr>
<tr><th scope="row">Common allergen</th><td>Milk</td><td>Depends on source: soy, nuts, gluten</td></tr>
<tr><th scope="row">Fits a vegetarian diet</th><td>Yes, if you eat dairy</td><td>Yes</td></tr>
<tr><th scope="row">Fits a vegan diet</th><td>No</td><td>Yes, if the rest of the product is plant-based</td></tr>
</tbody></table>
<h2>Which is better?</h2>
<p>For most people eating a varied diet, the total amount of protein across the day matters more than whether one snack used whey or soya. Choose based on your diet, your tolerance for dairy, any allergies and, honestly, which products you enjoy eating.</p>
<p>As a reference point, the Indian Council of Medical Research (ICMR-NIN) recommends about 0.83g of protein per kg of body weight per day for healthy adults (<a href="{NIN}" target="_blank" rel="noopener">source</a>). For a 60 kg adult that is roughly 50g a day. Athletes and people with specific health needs may need different amounts; a doctor or dietitian can advise.</p>
<h2>What ProBisCo uses</h2>
<p>ProBisCo's protein comes from plants: soya protein isolate, almond flour and oats. There is <strong>no whey</strong>. The cookie is <strong>100% eggless</strong> but <strong>not vegan</strong>, because we bake with real butter, so it contains milk. It also contains wheat, oats, almonds and soy. If you avoid dairy completely, ProBisCo isn't for you; if you eat dairy but want to skip whey, it is.</p>
{CTA}
''',
  },
  {
    'slug': 'eggless-protein-snacks',
    'title': 'Eggless Protein Snacks for Vegetarians: A Practical Guide',
    'short': 'Eggless protein snacks for vegetarians',
    'desc': 'Simple eggless, vegetarian ways to add protein to your snacks in India, from roasted chana and paneer to protein cookies, and what to check on packs.',
    'body': f'''
<p>Many vegetarians in India don't eat eggs, and a lot of "high-protein" snacks rely on eggs or meat. The good news is that there are plenty of eggless options. Some come from your kitchen, and some come in a packet.</p>
<h2>From the kitchen</h2>
<ul>
<li><strong>Roasted chana and peanuts.</strong> Cheap, crunchy and easy to carry.</li>
<li><strong>Paneer and curd.</strong> Paneer tikka, a bowl of curd or hung-curd dips.</li>
<li><strong>Sprouts chaat.</strong> Moong or mixed sprouts with onion, tomato and lemon.</li>
<li><strong>Besan and dal snacks.</strong> Besan chilla, dhokla or a moong dal cheela.</li>
<li><strong>Nuts and seeds.</strong> Almonds, pumpkin seeds and flax add protein along with healthy fats.</li>
</ul>
<h2>From a packet</h2>
<p>Packaged snacks are handy at work, in a gym bag or on the road. When you pick one, check:</p>
<ul>
<li><strong>The veg mark and the ingredients.</strong> The green dot tells you it is vegetarian; the ingredient list tells you whether it contains egg. "Eggless" should be clear on the pack.</li>
<li><strong>Protein per serving.</strong> A few grams more than a regular biscuit adds up over a week. See <a href="/learn/how-to-read-protein-on-food-labels/">how to read protein on a label</a>.</li>
<li><strong>Protein source.</strong> Whey and milk solids come from dairy; soya, pea and nut proteins come from plants. Our guide on <a href="/learn/plant-protein-vs-whey/">plant protein vs whey</a> explains the difference.</li>
<li><strong>Sugar and calories.</strong> A snack is still a snack. Know what you are eating.</li>
</ul>
<h2>Make it a habit you'll keep</h2>
<p>The best protein snack is the one you actually reach for instead of a regular biscuit or namkeen. Keep one at your desk, one in your bag and one in the kitchen. Pair a crunchy snack with chai or coffee rather than eating it on the run.</p>
<h2>Where ProBisCo fits</h2>
<p>ProBisCo is a 100% eggless chocolate chip cookie made with soya protein, almond flour and oats. Each cookie has about 5g of protein, and a jar of six has 30g. It contains milk (from butter), wheat, oats, almonds and soy, and it is lab-tested for protein. It works as the "packet" option: a cookie you'd eat anyway, with more protein than a regular one.</p>
{CTA}
''',
  },
  {
    'slug': 'how-to-read-protein-on-food-labels',
    'title': 'How to Read Protein on a Food Label: Per 100g, Per Serving and Per Pack',
    'short': 'How to read protein on food labels',
    'desc': 'Per 100g, per serving or per pack? How to read protein figures on Indian food labels and compare snacks fairly before you buy.',
    'body': f'''
<p>Two snacks can both say "protein" on the front and mean very different things. The numbers on the back tell you what you are actually getting, once you know which number to look at.</p>
<h2>The three numbers you'll see</h2>
<ul>
<li><strong>Per 100g.</strong> How protein-dense the food is. Use this to compare products of different sizes fairly.</li>
<li><strong>Per serving.</strong> What you get from the amount the brand expects you to eat, such as one cookie or one bar. Check what the serving size is.</li>
<li><strong>Per pack.</strong> The total in the whole packet. Useful if you eat the whole thing, misleading if you don't.</li>
</ul>
<h2>A worked example: ProBisCo</h2>
<table><thead><tr><th scope="col">Figure</th><th scope="col">ProBisCo</th></tr></thead><tbody>
<tr><th scope="row">Protein per 100g (lab-tested)</th><td>16.32g</td></tr>
<tr><th scope="row">Protein per cookie (31g serving)</th><td>about 5g</td></tr>
<tr><th scope="row">Protein per jar (6 cookies, 185g)</th><td>30g</td></tr>
<tr><th scope="row">Energy per cookie</th><td>115 kcal</td></tr>
</tbody></table>
<p>All three are true at once. "30g protein" on the front of our jar means the whole jar, not one cookie. We say this plainly because it is the most common confusion with protein snacks.</p>
<h2>Comparing two snacks fairly</h2>
<ol>
<li><strong>Compare per 100g</strong> to see which food is more protein-dense.</li>
<li><strong>Then look at the serving</strong> you will actually eat. A denser snack in a tiny serving can give you less than a lighter one in a bigger serving.</li>
<li><strong>Check energy and sugar per serving</strong> next to the protein. More protein for a lot more calories may not be the trade you want.</li>
<li><strong>Check the protein source and allergens</strong> in the ingredient list.</li>
</ol>
<h2>What about %RDA?</h2>
<p>Some labels show protein as a percentage of a daily reference value. For context, ICMR-NIN recommends about 0.83g of protein per kg of body weight per day for healthy adults (<a href="{NIN}" target="_blank" rel="noopener">source</a>), roughly 50g for a 60 kg adult. Your own needs depend on your weight, activity and health, so treat %RDA as a guide rather than a target.</p>
<h2>Lab-tested vs calculated</h2>
<p>Many nutrition panels are calculated from recipes. Some brands also send samples to an accredited lab to measure the protein. ProBisCo's protein was measured by Equinox Labs, an NABL-accredited lab in Noida, at 16.32g per 100g. <a href="/lab-report/">You can read the report</a>.</p>
{CTA}
''',
  },
]

def page(title, desc, path, main, extra_ld=None):
    s = TPL
    s = re.sub(r'<title>.*?</title>', f'<title>{html.escape(title)}</title>', s, count=1)
    s = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{html.escape(desc)}">', s, count=1)
    s = re.sub(r'<meta property="og:title" content="[^"]*">', f'<meta property="og:title" content="{html.escape(title)}">', s, count=1)
    s = re.sub(r'<meta property="og:description" content="[^"]*">', f'<meta property="og:description" content="{html.escape(desc)}">', s, count=1)
    s = s.replace('https://probisco.in/contact/', SITE + path)
    s = re.sub(r'<script type="application/ld\+json">.*?</script>\n?', '', s, flags=re.S)
    if extra_ld:
        s = s.replace('</head>', ''.join(f'<script type="application/ld+json">{json.dumps(x, ensure_ascii=False)}</script>\n' for x in extra_ld) + '</head>', 1)
    s = re.sub(r'<main id="main">.*?</main>', main, s, flags=re.S)
    return s

def crumbs_ld(items):
    return {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': i + 1, 'name': n, 'item': SITE + u} for i, (n, u) in enumerate(items)]}

def write(path, content):
    d = os.path.join(ROOT, path.strip('/'))
    os.makedirs(d, exist_ok=True)
    open(os.path.join(d, 'index.html'), 'w').write(content)

for a in ARTICLES:
    path = f"/learn/{a['slug']}/"
    others = ''.join(f'<li><a href="/learn/{o["slug"]}/">{html.escape(o["short"])}</a></li>' for o in ARTICLES if o is not a)
    main = f'''<main id="main">
<div class="wrap">
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/learn/">Learn</a> / {html.escape(a['short'])}</nav>
<div class="page-title"><h1>{html.escape(a['title'])}</h1><p class="lead">{html.escape(a['desc'])}</p></div>
<article class="prose">
<p class="updated">By the ProBisCo team · {DATE[8:].lstrip('0')} November 2026</p>
{a['body'].strip()}
<h2>Keep reading</h2>
<ul>{others}</ul>
</article>
</div>
</main>'''
    ld = [{'@context': 'https://schema.org', '@type': 'Article', 'headline': a['title'], 'description': a['desc'],
           'datePublished': DATE, 'dateModified': DATE, 'mainEntityOfPage': SITE + path,
           'image': SITE + '/assets/img/og-image.jpg',
           'author': {'@type': 'Organization', 'name': 'ProBisCo', 'url': SITE + '/'},
           'publisher': {'@type': 'Organization', 'name': 'ProBisCo', 'logo': {'@type': 'ImageObject', 'url': SITE + '/assets/img/icon-512.png'}}},
          crumbs_ld([('Home', '/'), ('Learn', '/learn/'), (a['short'], path)])]
    write(path, page(a['title'] + ' | ProBisCo', a['desc'], path, main, ld))

cards = ''.join(f'''<a class="card learn-card" href="/learn/{a['slug']}/"><b>{html.escape(a['title'])}</b><span class="muted">{html.escape(a['desc'])}</span><span class="learn-more">Read <span aria-hidden="true">→</span></span></a>''' for a in ARTICLES)
hub = f'''<main id="main">
<div class="wrap">
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / Learn</nav>
<div class="page-title"><h1>Learn</h1><p class="lead">Straight answers about protein, snacks and reading labels. No hype.</p></div>
<div class="learn-grid">{cards}</div>
</div>
</main>'''
write('/learn/', page('Protein Snacks Explained: Guides and Answers | ProBisCo', 'Plain-English guides to protein cookies, plant protein vs whey, eggless protein snacks and reading protein on food labels.', '/learn/', hub,
      [crumbs_ld([('Home', '/'), ('Learn', '/learn/')])]))
print('built', len(ARTICLES), 'articles + hub')
