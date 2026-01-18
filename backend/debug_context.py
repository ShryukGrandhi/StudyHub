import asyncio
from main import OpenNoteAPI

async def debug_search():
    print("--- Starting Debug Search ---")
    api = OpenNoteAPI()
    
    # 1. Test List
    print("Calling journals_list()...")
    journals_resp = await api.journals_list()
    
    if not journals_resp:
        print("❌ journals_list returned None")
        return
        
    print(f"Response keys: {journals_resp.keys()}")
    
    journals = []
    if "journals" in journals_resp:
        journals = journals_resp["journals"]
    
    print(f"📚 Found {len(journals)} journals.")
    
    search_text = "what do my notes say about hamlet's indecision biology".lower()
    print(f"🔍 Testing Search Text: '{search_text}'")
    
    for j in journals:
        title = j.get('title', 'NO_TITLE')
        print(f"\nChecking Journal: '{title}' (ID: {j.get('id')})")
        
        # Test Matching Logic
        is_match = False
        if title.lower() in search_text:
            print("  ✅ Direct match!")
            is_match = True
        else:
            keywords = [w for w in title.lower().split() if len(w) > 3]
            print(f"  Keywords: {keywords}")
            if any(k in search_text for k in keywords):
                print(f"  ✅ Keyword match found! ({[k for k in keywords if k in search_text]})")
                is_match = True
            else:
                print("  ❌ No match.")

        if is_match:
             print("  -> Would fetch content.")

if __name__ == "__main__":
    asyncio.run(debug_search())
