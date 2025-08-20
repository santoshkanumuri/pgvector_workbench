# Open Frontend tab: run npm install and npm run dev
Start-Process powershell -ArgumentList "cd 'c:\projects\personal\db_look\frontend'; npm install; npm run dev"

# Open Backend tab: run uv run main.py
Start-Process powershell -ArgumentList "cd 'c:\projects\personal\db_look\backend'; uv run main.py"