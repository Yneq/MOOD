import json
import mysql.connector
import re

with open('data/taipei-attractions.json', 'r', encoding='utf-8') as att:
    data = json.load(att)

db = mysql.connector.connect(
    user = 'root',
    host = 'localhost',
    password = '244466666',
    database = 'tdt'
)
cursor = db.cursor()

def filter_img(img_urls):
    urls = re.findall(r'https?://[^\s]+?\.(?:jpg|png|JPG|PNG)', img_urls)

    filtered_urls = []
    for url in urls:
        filtered_urls.append(url)
    return filtered_urls

for item in data['result']['results']:
    name = item['name']
    category = item['CAT']
    description = item['description']
    address = item['address']
    transport = item['direction']
    mrt = item['MRT']
    lat = item['latitude']
    lng = item['longitude']
    images = json.dumps(filter_img(item['file']))

    print(f"Processing item: {name}")
    print(f"Images before filtering: {item['file']}")
    print(f"Filtered images: {images}")

    cursor.execute("INSERT INTO attractions(name, category, description, address, transport, mrt, lat, lng, images) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)", (name, category, description, address, transport, mrt, lat, lng, images))

db.commit()
cursor.close()
db.close()


