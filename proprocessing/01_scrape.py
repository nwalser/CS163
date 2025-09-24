import requests, re, os
from bs4 import BeautifulSoup
from urllib.parse import urljoin

pattern = re.compile(r".*extent_v4.0.tif$")

def download_recursive(url, outdir="data"):
    os.makedirs(outdir, exist_ok=True)
    r = requests.get(url)
    soup = BeautifulSoup(r.text, "html.parser")

    for link in soup.find_all("a")[1:]:
        href = link.get("href")
        full_url = urljoin(url, href)
        if href.endswith("/"):  # recurse into directory
            download_recursive(full_url, os.path.join(outdir, href.strip("/")))
        elif pattern.match(href):
            path = os.path.join(outdir, href)
            if not os.path.exists(path):
                print("Downloading", full_url)
                file_data = requests.get(full_url).content
                with open(path, "wb") as f:
                    f.write(file_data)

archive_url = "https://noaadata.apps.nsidc.org/NOAA/G02135/north/daily/geotiff/"
download_recursive(archive_url)
