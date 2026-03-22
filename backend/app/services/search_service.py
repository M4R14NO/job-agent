import pandas as pd
from jobspy import scrape_jobs


def fetch_jobs(
    *,
    site_name,
    search_term,
    location,
    results_wanted,
    hours_old,
    is_remote,
    linkedin_fetch_description,
    description_format,
):
    jobs = scrape_jobs(
        site_name=site_name,
        search_term=search_term,
        location=location,
        results_wanted=results_wanted,
        hours_old=hours_old,
        is_remote=is_remote,
        linkedin_fetch_description=linkedin_fetch_description,
        description_format=description_format,
    )

    jobs = jobs.where(pd.notnull(jobs), None)
    return jobs.to_dict(orient="records")
