$headers = @{
    apikey = 'sb_publishable_4Rhk--WUKJFTeEDjwveyjg_kaIPxlDa'
    Authorization = 'Bearer sb_publishable_4Rhk--WUKJFTeEDjwveyjg_kaIPxlDa'
}
$uri = 'https://yioqqdprzzeqrlwfyqov.supabase.co/rest/v1/house_ger?select=pics_jsonStr,mainpic,display_district&display_state=eq.Aargau&display_city=eq.Aarau&display_district=eq.G%C3%B6nhard&limit=2'
Invoke-RestMethod -Uri $uri -Headers $headers | ConvertTo-Json -Depth 5
