import os
import re
import pandas as pd

download_dir = "data"
pattern = re.compile(r".*.tif$")

rows = []

for root, _, files in os.walk(download_dir):
    for file in files:
        if pattern.match(file):
            path = os.path.join(root, file)
            rows.append({
                "filename": file,
                "local_path": path,
                "size_bytes": os.path.getsize(path)
            })

df = pd.DataFrame(rows)
print(df.head())


from PIL import Image
import numpy as np

def count_white(path):
    img = Image.open(path).convert("L")  # grayscale
    arr = np.array(img)
    return np.sum(arr == 255)  # count pure white pixels

df["white_pixels"] = df["local_path"].apply(count_white)
df["date"] = df["filename"].str.extract(r"_(\d{8})_")[0]
df["date"] = pd.to_datetime(df["date"], format="%Y%m%d")

print(df.head())


import matplotlib.pyplot as plt

plt.figure(figsize=(8,5))
plt.plot(df["date"], df["white_pixels"], marker="o")
plt.xlabel("Date")
plt.ylabel("White Pixels")
plt.title("White Pixels vs Date")
plt.xticks(rotation=45)
plt.tight_layout()
plt.show()
