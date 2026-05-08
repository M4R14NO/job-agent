import pandas as pd
from jobspy import scrape_jobs


def fetch_jobs(
    *,
    site_name,
    search_term,
    location,
    search_radius_km,
    results_wanted,
    hours_old,
    is_remote,
    linkedin_fetch_description,
    description_format,
):
    distance = round(search_radius_km / 1.60934) if search_radius_km is not None else None
    jobs = scrape_jobs(
        site_name=site_name,
        search_term=search_term,
        location=location,
        distance=distance,
        results_wanted=results_wanted,
        hours_old=hours_old,
        is_remote=is_remote,
        linkedin_fetch_description=linkedin_fetch_description,
        description_format=description_format,
    )

    jobs = jobs.where(pd.notnull(jobs), None)
    return jobs.to_dict(orient="records")
