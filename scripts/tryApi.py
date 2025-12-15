import requests
import json
#https://api.bilibili.com/x/web-interface/wbi/search/type?category_id=&search_type=video&__refresh__=true&keyword=BV1F7CZBuEJQ
#https://api.bilibili.com/x/web-interface/view?bvid=BV1F7CZBuEJQ

import requests
import json

from typing import Tuple, Optional, Any

def get_bilibili_video_info(bvid: str) -> Tuple[Optional[int], Optional[int], Optional[int]]:
    """
    从B站视频API获取指定bvid的JSON数据，并返回 code, tid, 和 tid_v2。    
    Args:
        bvid (str): B站视频的BV号 (例如: 'BV1F7CZBuEJQ')  
    Returns:
        Tuple[Optional[int], Optional[int], Optional[int]]: 
            (code, tid, tid_v2)。失败时返回 (None, None, None)。
     """
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    # 构造完整的API URL
    url = f"https://api.bilibili.com/x/web-interface/view?bvid={bvid}"
    
    try:
        # 发送HTTP GET请求
        #print(f"正在请求URL: {url}")
        response = requests.get(url, headers=headers, timeout=10) # 增加超时设置
        response.raise_for_status() # 检查HTTP请求是否成功 (200 OK)
        
        # 解析JSON数据
        data = response.json()
        
        # --- 提取 code ---
        api_code = data.get('code')
        
        # 检查B站API的返回状态码（B站API中，code=0通常表示成功）
        if api_code == 0:
            video_data = data.get('data')
            
            if not video_data:
                print("API返回成功，但'data'字段为空。")
                return api_code, None, None
            
            # --- 提取 tid 和 tid_v2 ---
            tid = video_data.get('tid')
            tid_v2 = video_data.get('tid_v2')
            
            # 返回成功提取的所有信息
            return api_code, tid, tid_v2
            
        else:
            # API返回非0错误码的情况
            #print(f"API返回错误，错误码: {api_code}")
            #print(f"错误信息: {data.get('message', '未知错误')}")
            return api_code, None, None
            
    except :
        #print(f"{bvid} 出现错误")
        return None,None,None
def get_bilibili_search_results(bvid: str):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    # 构造完整的API URL
    url = f"https://api.bilibili.com/x/web-interface/wbi/search/type?category_id=&search_type=video&__refresh__=true&keyword={bvid}"
    
    try:
        # 发送HTTP GET请求
        #print(f"正在请求URL: {url}")
        response = requests.get(url, headers=headers, timeout=10) # 增加超时设置
        response.raise_for_status() # 检查HTTP请求是否成功 (200 OK)
        
        # 解析JSON数据
        data = response.json()
        
        # --- 提取 code ---
        api_code = data.get('code')
        
        # 检查B站API的返回状态码（B站API中，code=0通常表示成功）
        if api_code == 0:
            video_data = data.get('data')
            print(data)
            result=video_data.get('result')
            if not result:
                print("API返回成功，但'result'字段为空。")
                return api_code, None, None
            print(result)
            # --- 提取 tid 和 tid_v2 ---
            tid = video_data.get('tid')
            tid_v2 = video_data.get('tid_v2')
            
            # 返回成功提取的所有信息
            return api_code, tid, tid_v2
            
        else:
            # API返回非0错误码的情况
            print(f"API返回错误，错误码: {api_code}")
            print(f"错误信息: {data.get('message', '未知错误')}")
            return api_code, None, None
            
    except :
        print(f"{bvid} 出现错误")
        return None,None,None

get_bilibili_search_results("BV1F7CZBuEJQ")
# 执行最新的函数
code ,tid,tid_v2 = get_bilibili_video_info("BV1F7CZBuEJQ")

if(code is not None):
    print("\n--- 最终结果 ---")
    print(f"Code (状态码): {code}")
    print(f"Tid: {tid}")
    print(f"Tid_v2: {tid_v2}")