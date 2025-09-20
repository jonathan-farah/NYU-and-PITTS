import pandas as pd
import sqlite3
import re

xlsx_path = "buildings.xlsx"
db_path   = "app.db"
table     = "buildings"

# 1) Read the right sheet and keep *everything* as text so nothing turns into NaN unexpectedly
df = pd.read_excel(
    xlsx_path,
    sheet_name=0,             # change if your data is on another sheet
    dtype=str,
    keep_default_na=False     # prevents 'NA', 'N/A' etc from becoming NaN
)

# 2) Clean column names: strip spaces, collapse internal whitespace, remove trailing dots,
#    normalize punctuation variants so they match what you want
def norm_col(c):
    c = str(c)
    c = c.strip()
    c = re.sub(r'\s+', ' ', c)       # collapse multiple spaces
    c = c.replace('Bldg #', 'Bldg.#')
    c = c.replace('Bldg. #', 'Bldg.#')
    c = c.replace('Abbr', 'Abbr.') if c in ['Abbr', 'Abbr '] else c
    return c

df.columns = [norm_col(c) for c in df.columns]

# 3) If your header row wasn’t the first row (e.g., there’s a title row above),
#    detect and fix by looking for the expected headers inside the first few rows.
expected = {"Building Name", "Abbr.", "Bldg.#", "Address", "City", "Zip Code"}
if not expected.issubset(set(df.columns)):
    # Try to promote a row to header if needed
    # Look in the first 5 rows for a row that contains your expected headers
    for i in range(5):
        row = df.iloc[i].astype(str).str.strip()
        if expected.issubset(set(row.values)):
            df = pd.read_excel(
                xlsx_path,
                header=i,              # use that row as header
                dtype=str,
                keep_default_na=False
            )
            df.columns = [norm_col(c) for c in df.columns]
            break

# 4) Trim cell text (common source of “empty looking” values)
df = df.applymap(lambda x: x.strip() if isinstance(x, str) else x)

# 5) Optional sanity checks: see how many missing values in those columns
print("Nulls after import:")
print(df[["Abbr.", "Bldg.#"]].isna().sum())

# 6) Write to SQLite with safe column names (remove punctuation for DB, keep mapping if you want)
safe_cols = {c: c
.replace('.', '')
.replace('#', 'No')
.replace(' ', '_')
             for c in df.columns}
df_sql = df.rename(columns=safe_cols)

conn = sqlite3.connect(db_path)
df_sql.to_sql(table, conn, if_exists="replace", index=False)

# Helpful indexes
if "City" in df.columns:
    conn.execute(f'CREATE INDEX IF NOT EXISTS idx_{table}_city ON {table}("City");')
if "Bldg.#" in df.columns:
    conn.execute(f'CREATE INDEX IF NOT EXISTS idx_{table}_bldgno ON {table}("BldgNo");')

conn.close()
print("Done. Wrote to", db_path)
