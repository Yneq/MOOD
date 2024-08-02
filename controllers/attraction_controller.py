from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
import json
from dependencies import get_db

router = APIRouter()


@router.get("/api/attractions")
def attractions(page: int=Query(0, ge=0), keyword: str=None):

#	error_test = 1 / 0   code500 test
	try:
		db = get_db()
		cursor = db.cursor(dictionary=True)

		if keyword:
			sql = """
            SELECT * FROM attractions 
            WHERE 
                name LIKE %s OR 
                mrt LIKE %s 
            LIMIT %s, 12
            """
			count_sql = """
            SELECT COUNT(*) as total FROM attractions 
            WHERE 
                name LIKE %s OR 
                mrt LIKE %s
            """
			
			like_keyword = '%' + keyword + '%'
			cursor.execute(count_sql, (like_keyword, like_keyword))
			total_records = cursor.fetchone()["total"]
			
			cursor.execute(sql, (like_keyword, like_keyword, page * 12))
		else:
			sql = "SELECT * FROM attractions LIMIT %s, 12"
			count_sql = "SELECT COUNT(*) as total FROM attractions"
			
			cursor.execute(count_sql)
			total_records = cursor.fetchone()["total"]
		
			cursor.execute(sql, (page * 12,))

		attractions = cursor.fetchall()
		cursor.close()
		db.close()

		if not attractions:
			return {
			"nextPage": None,
			"data": []
			}
		for attraction in attractions:
			attraction['images'] = json.loads(attraction['images'])
			
		next_page = page + 1 if (page + 1) * 12 < total_records else None
		return {
			"nextPage":next_page,
			"data":attractions
			}
	except Exception as e:
		return JSONResponse	(
				status_code=500,
				content={"error": True, "message": f"伺服器內部錯誤"}
				)


@router.get("/api/attraction/{attractionId}")
def get_attractionId(attractionId: int):
	try:
		db = get_db()
		cursor = db.cursor(dictionary=True)
		
		sql = "SELECT * FROM attractions WHERE id = %s"
		cursor.execute(sql, (attractionId,))
		attraction = cursor.fetchone()

		cursor.close()
		db.close()

		if not attraction:
			return JSONResponse(
				status_code=400,
		    	content={"error":True, "message": f"景點編號不正確"}
			)
		attraction['images'] = json.loads(attraction['images'])
		return {"data": attraction}
	
	except Error as e:
		print(f"Database error: {str(e)}")  # 添加這行進行調試
		return JSONResponse(
			status_code=500,
			content={"error":True, "message": f"伺服器內部錯誤息"}
		)


@router.get("/api/mrts")
def get_mrts():
    try:
        db = get_db()
        cursor = db.cursor()
        sql = "SELECT mrt FROM attractions WHERE mrt IS NOT NULL GROUP by mrt ORDER BY COUNT(*) DESC"
        cursor.execute(sql)
        mrts = cursor.fetchall()
        cursor.close()
        db.close()

        if not mrts:
            return JSONResponse(
                status_code=500,
                content={"error": True, "message": "伺服器內部錯誤"}
            )
        mrts_names = [mrt[0] for mrt in mrts]
        return {"data": mrts_names}
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": True, "message": "伺服器內部錯誤"}
        )